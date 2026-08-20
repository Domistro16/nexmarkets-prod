import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

export class PostgresStore {
  constructor({ connectionString = process.env.DATABASE_URL, pool } = {}) {
    if (!pool && !connectionString) throw new Error('DATABASE_URL is required');
    this.pool = pool ?? new pg.Pool({ connectionString, max: 10, application_name: 'nexmarkets-api' });
    this.ownsPool = !pool;
  }

  async ready() { await this.pool.query('SELECT 1'); return true; }
  async indexerHealth(chainId) {
    const { rows } = await this.pool.query('SELECT * FROM indexer_checkpoint WHERE chain_id=$1 ORDER BY updated_at DESC LIMIT 1', [chainId]);
    return rows[0] ?? null;
  }
  async close() { if (this.ownsPool) await this.pool.end(); }

  async saveChallenge(challenge) {
    await this.pool.query(
      `INSERT INTO wallet_challenge(nonce,account_id,wallet_address,origin,domain,chain_id,message,issued_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0))`,
      [challenge.nonce, challenge.accountId, challenge.address, challenge.origin, challenge.domain, challenge.chainId, challenge.message, challenge.issuedAt, challenge.expiresAt]
    );
  }

  async challenge(nonce) {
    const { rows } = await this.pool.query('SELECT * FROM wallet_challenge WHERE nonce=$1', [nonce]);
    if (!rows[0]) return null;
    const row = rows[0];
    return { accountId: row.account_id, address: row.wallet_address, nonce: row.nonce, origin: row.origin, domain: row.domain, chainId: Number(row.chain_id), message: row.message, issuedAt: row.issued_at.getTime(), expiresAt: row.expires_at.getTime(), consumedAt: row.consumed_at?.getTime() ?? null };
  }

  async consumeChallengeAndCreateSession({ challenge, session, signature }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const consumed = await client.query(
        `UPDATE wallet_challenge SET consumed_at=now(),signature=$2 WHERE nonce=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING nonce`,
        [challenge.nonce, signature]
      );
      if (!consumed.rowCount) throw new Error('CHALLENGE_ALREADY_USED_OR_EXPIRED');
      const accountId = `acct_${sha256(challenge.address).slice(0, 24)}`;
      const walletId = `wal_${sha256(`${challenge.chainId}:${challenge.address}`).slice(0, 24)}`;
      await client.query('INSERT INTO account(id) VALUES($1) ON CONFLICT(id) DO NOTHING', [accountId]);
      await client.query(
        `INSERT INTO wallet(id,account_id,chain_id,address,verified_at) VALUES($1,$2,$3,$4,now())
         ON CONFLICT(chain_id,address) DO UPDATE SET verified_at=excluded.verified_at,revoked_at=NULL`,
        [walletId, accountId, challenge.chainId, challenge.address]
      );
      await client.query(
        `INSERT INTO app_session(id,account_id,wallet_id,token_hash,csrf_hash,expires_at)
         VALUES($1,$2,$3,$4,$5,to_timestamp($6/1000.0))`,
        [session.id, accountId, walletId, session.tokenHash, session.csrfHash, session.expiresAt]
      );
      await client.query('COMMIT');
      return { accountId, walletId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async sessionByToken(token) {
    const { rows } = await this.pool.query(
      `SELECT s.*,w.address wallet_address,w.chain_id FROM app_session s JOIN wallet w ON w.id=s.wallet_id
       WHERE s.token_hash=$1`, [sha256(token)]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return { id: row.id, accountId: row.account_id, walletId: row.wallet_id, walletAddress: row.wallet_address, chainId: Number(row.chain_id), tokenHash: row.token_hash, csrfHash: row.csrf_hash, expiresAt: row.expires_at.getTime(), revokedAt: row.revoked_at?.getTime() ?? null };
  }

  async revokeSession(id) { await this.pool.query('UPDATE app_session SET revoked_at=now() WHERE id=$1', [id]); }

  async recordAudit({ accountId = null, walletAddress = null, action, objectType, objectId, requestId, correlationId, metadata = {} }) {
    await this.pool.query(
      `INSERT INTO audit_log(id,actor_account_id,actor_wallet_address,action,object_type,object_id,request_id,correlation_id,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [`aud_${randomUUID()}`, accountId, walletAddress?.toLowerCase() ?? null, action, objectType, objectId, requestId, correlationId, JSON.stringify(metadata)]
    );
  }

  async prepareTransaction({ accountId, walletAddress, chainId, intentType, intentId, idempotencyKey, correlationId, requestId }) {
    if (![4663, 46630].includes(Number(chainId))) throw new Error('ROBINHOOD_CHAIN_REQUIRED');
    const id = `txj_${randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO chain_transaction(id,chain_id,intent_type,intent_id,wallet_address,state,correlation_id,request_id)
       VALUES($1,$2,$3,$4,$5,'PREPARED',$6,$7)
       ON CONFLICT(chain_id,wallet_address,intent_type,intent_id) DO UPDATE SET updated_at=chain_transaction.updated_at
       RETURNING *`,
      [id, chainId, intentType, idempotencyKey ?? intentId, walletAddress.toLowerCase(), correlationId, requestId]
    );
    return result.rows[0];
  }

  async updateTransaction({ id, accountId, eventId, fromState, toState, evidence = {} }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existingEvent = await client.query('SELECT transaction_id FROM transaction_event WHERE event_id=$1', [eventId]);
      if (existingEvent.rowCount) {
        const existing = await client.query(
          `SELECT t.* FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id
           WHERE t.id=$1 AND w.account_id=$2`, [existingEvent.rows[0].transaction_id, accountId]
        );
        await client.query('COMMIT');
        return existing.rows[0] ?? null;
      }
      if (fromState === toState) throw new Error('TRANSACTION_DUPLICATE_STATE');
      const updated = await client.query(
        `UPDATE chain_transaction t SET state=$3,tx_hash=COALESCE($4,tx_hash),block_number=COALESCE($5,block_number),
          block_hash=COALESCE($6,block_hash),confirmations=COALESCE($7,confirmations),
          finalized_at=CASE WHEN $3='FINALIZED' THEN COALESCE($8,now()) ELSE finalized_at END,
          failure_code=COALESCE($9,failure_code),updated_at=now()
         FROM wallet w WHERE t.id=$1 AND w.address=t.wallet_address AND w.chain_id=t.chain_id
          AND w.account_id=$2 AND t.state=$10 RETURNING t.*`,
        [id, accountId, toState, evidence.txHash ?? null, evidence.blockNumber ?? null, evidence.blockHash ?? null,
          evidence.confirmations ?? null, evidence.finalizedAt ?? null, evidence.failureCode ?? null, fromState]
      );
      if (!updated.rowCount) throw new Error('TRANSACTION_STATE_CONFLICT');
      await client.query(
        `INSERT INTO transaction_event(event_id,transaction_id,from_state,to_state,evidence) VALUES($1,$2,$3,$4,$5::jsonb)`,
        [eventId, id, fromState, toState, JSON.stringify(evidence)]
      );
      await client.query('COMMIT');
      return updated.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async transaction(id, accountId) {
    const { rows } = await this.pool.query(
      `SELECT t.* FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id
       WHERE t.id=$1 AND w.account_id=$2`, [id, accountId]
    );
    return rows[0] ?? null;
  }

  async discover() {
    const { rows } = await this.pool.query(
      `SELECT p.slug,p.name,p.summary,e.edition_address,e.absolute_supply_cap,t.price_usdg,t.mint_starts_at,t.mint_ends_at
       FROM project p JOIN edition e ON e.project_id=p.id
       LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE p.status='PUBLISHED' AND e.orphaned_at IS NULL ORDER BY p.published_at DESC NULLS LAST LIMIT 100`
    );
    return rows;
  }

  async ownedPasses(address) {
    const { rows } = await this.pool.query(
      `SELECT pt.*,e.edition_address,p.name project_name FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id
       WHERE pt.owner_address=$1 AND pt.orphaned_at IS NULL`, [address.toLowerCase()]
    );
    return rows;
  }

  async projectBySlug(slug) {
    const { rows } = await this.pool.query('SELECT * FROM project WHERE slug=$1 AND status=$2', [slug, 'PUBLISHED']);
    if (!rows[0]) return null;
    const editions = await this.pool.query(
      `SELECT e.*,t.version active_terms_version,t.terms_hash active_terms_hash,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE e.project_id=$1 AND e.orphaned_at IS NULL ORDER BY e.created_at`, [rows[0].id]
    );
    return { ...rows[0], editions: editions.rows };
  }

  async editionByAddress(address) {
    const { rows } = await this.pool.query(
      `SELECT e.*,p.slug,p.name FROM edition e JOIN project p ON p.id=e.project_id
       WHERE e.edition_address=$1 AND e.orphaned_at IS NULL`, [address.toLowerCase()]
    );
    if (!rows[0]) return null;
    const terms = await this.pool.query('SELECT * FROM terms_version WHERE edition_id=$1 AND orphaned_at IS NULL ORDER BY version DESC', [rows[0].id]);
    return { ...rows[0], termsHistory: terms.rows };
  }

  async pass(editionAddress, tokenId) {
    const { rows } = await this.pool.query(
      `SELECT pt.*,e.edition_address,p.slug,p.name FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id
       WHERE e.edition_address=$1 AND pt.token_id=$2 AND pt.orphaned_at IS NULL`,
      [editionAddress.toLowerCase(), tokenId]
    );
    if (!rows[0]) return null;
    const [advantages, listing] = await Promise.all([
      this.pool.query('SELECT * FROM advantage_state_projection WHERE edition_id=$1 AND token_id=$2 AND orphaned_at IS NULL', [rows[0].edition_id, tokenId]),
      this.pool.query(`SELECT * FROM listing_projection WHERE edition_id=$1 AND token_id=$2 AND orphaned_at IS NULL ORDER BY updated_at DESC LIMIT 1`, [rows[0].edition_id, tokenId])
    ]);
    return { ...rows[0], advantages: advantages.rows, listing: listing.rows[0] ?? null };
  }

  async listings() {
    const { rows } = await this.pool.query(
      `SELECT l.*,e.edition_address,p.name project_name FROM listing_projection l
       JOIN edition e ON e.id=l.edition_id JOIN project p ON p.id=e.project_id
       WHERE l.status='ACTIVE' AND l.orphaned_at IS NULL AND l.expires_at>now() ORDER BY l.updated_at DESC LIMIT 200`
    );
    return rows;
  }

  async createProject({ accountId, body }) {
    const id = `prj_${randomUUID()}`;
    const { rows } = await this.pool.query(
      `INSERT INTO project(id,builder_account_id,slug,name,summary,content) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
      [id, accountId, body.slug, body.name, body.summary ?? '', JSON.stringify(body.launchDraft ?? {})]
    );
    return rows[0];
  }

  async createMedia({ accountId, metadata }) {
    const id = `med_${randomUUID()}`;
    const { rows } = await this.pool.query(
      `INSERT INTO media_asset(id,owner_account_id,storage_key,original_filename,mime_type,byte_size,sha256,safety_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, accountId, metadata.storageKey, metadata.filename, metadata.mimeType, metadata.byteSize, metadata.sha256, 'PENDING']
    );
    return rows[0];
  }

  async advantagesForOwner(address) {
    const { rows } = await this.pool.query(
      `SELECT a.*,p.token_id,e.edition_address,p.terms_hash FROM advantage_state_projection a
       JOIN pass_token_projection p ON p.edition_id=a.edition_id AND p.token_id=a.token_id
       JOIN edition e ON e.id=a.edition_id
       WHERE p.owner_address=$1 AND p.orphaned_at IS NULL AND a.orphaned_at IS NULL`,
      [address.toLowerCase()]
    );
    return rows;
  }

  async builderDashboard(accountId) {
    const [projects, editions, royalties, referrals] = await Promise.all([
      this.pool.query('SELECT * FROM project WHERE builder_account_id=$1 ORDER BY updated_at DESC', [accountId]),
      this.pool.query(`SELECT e.* FROM edition e JOIN project p ON p.id=e.project_id WHERE p.builder_account_id=$1 AND e.orphaned_at IS NULL`, [accountId]),
      this.pool.query(`SELECT r.* FROM royalty_claim_projection r JOIN edition e ON e.id=r.edition_id JOIN project p ON p.id=e.project_id WHERE p.builder_account_id=$1 AND r.orphaned_at IS NULL`, [accountId]),
      this.pool.query(`SELECT s.* FROM referral_settlement s WHERE s.builder_account_id=$1 ORDER BY s.created_at DESC`, [accountId])
    ]);
    return { projects: projects.rows, editions: editions.rows, royalties: royalties.rows, referrals: referrals.rows };
  }

  async claimOutbox(limit = 50) {
    const { rows } = await this.pool.query(
      `WITH claimed AS (
         SELECT id FROM outbox_event WHERE delivered_at IS NULL AND dead_at IS NULL
          AND available_at<=now() AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes')
         ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT $1
       ) UPDATE outbox_event o SET locked_at=now() FROM claimed WHERE o.id=claimed.id RETURNING o.*`, [limit]
    );
    return rows.map((row) => ({ ...row, eventType: row.event_type, businessKey: row.business_key, deliveredAt: row.delivered_at }));
  }

  async enqueueNotification(event) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const notificationId = `not_${sha256(`${event.type}:${event.businessKey}:${event.accountId ?? ''}`).slice(0, 24)}`;
      await client.query(
        `INSERT INTO notification(id,account_id,type,business_key,payload) VALUES($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT(type,business_key,account_id) DO NOTHING`,
        [notificationId, event.accountId, event.type, event.businessKey, JSON.stringify(event.payload)]
      );
      await client.query(
        `INSERT INTO outbox_event(id,aggregate_type,aggregate_id,event_type,business_key,payload)
         VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(event_type,business_key) DO NOTHING`,
        [event.id, event.aggregateType, event.aggregateId, event.type, event.businessKey, JSON.stringify({ notificationId, ...event.payload })]
      );
      await client.query('COMMIT');
      return { notificationId, outboxId: event.id };
    } catch (error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  }

  async markOutboxDelivered(id) {
    await this.pool.query('UPDATE outbox_event SET delivered_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND delivered_at IS NULL', [id]);
  }

  async markOutboxFailed(id, { attempt, dead, delaySeconds, error }) {
    await this.pool.query(
      `UPDATE outbox_event SET attempt=$2,locked_at=NULL,last_error=$3,
       available_at=now()+($4::text||' seconds')::interval,dead_at=CASE WHEN $5 THEN now() ELSE dead_at END
       WHERE id=$1 AND delivered_at IS NULL`, [id, attempt, String(error).slice(0, 1000), delaySeconds, dead]
    );
  }

  async startRun(scope) {
    const id = `rec_${randomUUID()}`;
    const { rows } = await this.pool.query(
      `INSERT INTO reconciliation_run(id,chain_id,scope,status) VALUES($1,$2,$3,'RUNNING') RETURNING *`,
      [id, scope.chainId ?? 4663, JSON.stringify(scope)]
    );
    return rows[0];
  }

  async recordIncident(incident) {
    const id = `inc_${randomUUID()}`;
    await this.pool.query(
      `INSERT INTO reconciliation_incident(id,run_id,authority,object_key,severity,expected,observed,status,repair_action)
       VALUES($1,$2,$3,$4,'HIGH',$5::jsonb,$6::jsonb,'OPEN',$7)`,
      [id, incident.runId, incident.authority ?? 'CHAIN', `${incident.objectKey}:${incident.check}`,
        JSON.stringify(incident.expected ?? null), JSON.stringify(incident.observed ?? { error: incident.error }), incident.repairAction]
    );
  }

  async finishRun(id, status, result) {
    await this.pool.query(
      `UPDATE reconciliation_run SET status=$2,checked_count=$3,discrepancy_count=$4,evidence=$5::jsonb,finished_at=now() WHERE id=$1`,
      [id, status, result.checkedCount ?? 0, result.discrepancies.length, JSON.stringify(result)]
    );
  }
}
