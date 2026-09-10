import { createHash, randomUUID } from 'node:crypto';
import { aggregatePrimarySales, calculatePrimarySale, primarySaleEventKey } from '../../domain/src/primary-accounting.mjs';
let pgModule = null;
async function getPg() {
  if (!pgModule) {
    try {
      pgModule = await import('pg');
    } catch {
      throw new Error('Postgres client (pg) is not available in this environment');
    }
  }
  return pgModule.default ?? pgModule;
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function builderError(code, status = 403) { return Object.assign(new Error(code), { status }); }
function projectedAdvantageRemaining(row, now = Math.floor(Date.now() / 1000)) {
  const kind = String(row.kind ?? '').toUpperCase();
  const starts = row.starts_at ? Math.floor(new Date(row.starts_at).getTime() / 1000) : 0;
  const ends = row.ends_at ? Math.floor(new Date(row.ends_at).getTime() / 1000) : 0;
  let effective = Math.max(0, now - Number(row.frozen_seconds ?? 0));
  if (kind === 'TIME_BASED' && row.listed && row.listed_at) {
    const listedTimestamp = Math.floor(new Date(row.listed_at).getTime() / 1000) - Number(row.frozen_seconds ?? 0);
    if (listedTimestamp < ends) effective = effective < Math.max(listedTimestamp, starts) ? effective : Math.max(listedTimestamp, starts);
  }
  if (effective < starts || effective >= ends) return '0';
  if (kind === 'TIME_BASED') return String(ends - effective);
  if (kind === 'CONNECTED') return '1';
  return String(row.remaining_units ?? 0);
}

export class PostgresStore {
  constructor({ connectionString = process.env.DATABASE_URL, pool } = {}) {
    if (!pool && !connectionString) throw new Error('DATABASE_URL is required');
    this.connectionString = connectionString;
    this.pool = pool;
    this.ownsPool = !pool;
  }

  async _getPool() {
    if (!this.pool) {
      const pg = await getPg();
      const Pool = pg.Pool ?? pg;
      this.pool = new Pool({ connectionString: this.connectionString, max: 10, application_name: 'nexmarkets-api' });
    }
    return this.pool;
  }

  async ready() { await (await this._getPool()).query('SELECT 1'); return true; }
  async indexerHealth(chainId) {
    const { rows } = await (await this._getPool()).query('SELECT * FROM indexer_checkpoint WHERE chain_id=$1 ORDER BY updated_at DESC LIMIT 1', [chainId]);
    return rows[0] ?? null;
  }

  async chainHead(chain) { return chain?.getBlockNumber ? chain.getBlockNumber() : null; }
  async close() { if (this.ownsPool) if (this.pool) await this.pool.end(); }

  async saveChallenge(challenge) {
    await (await this._getPool()).query(
      `INSERT INTO wallet_challenge(nonce,account_id,wallet_address,origin,domain,chain_id,message,issued_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0))`,
      [challenge.nonce, challenge.accountId, challenge.address, challenge.origin, challenge.domain, challenge.chainId, challenge.message, challenge.issuedAt, challenge.expiresAt]
    );
  }

  async challenge(nonce) {
    const { rows } = await (await this._getPool()).query('SELECT * FROM wallet_challenge WHERE nonce=$1', [nonce]);
    if (!rows[0]) return null;
    const row = rows[0];
    return { accountId: row.account_id, address: row.wallet_address, nonce: row.nonce, origin: row.origin, domain: row.domain, chainId: Number(row.chain_id), message: row.message, issuedAt: row.issued_at.getTime(), expiresAt: row.expires_at.getTime(), consumedAt: row.consumed_at?.getTime() ?? null };
  }

  async consumeChallengeAndCreateSession({ challenge, session, signature }) {
    const client = await (await this._getPool()).connect();
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
    const { rows } = await (await this._getPool()).query(
      `SELECT s.*,w.address wallet_address,w.chain_id FROM app_session s JOIN wallet w ON w.id=s.wallet_id
       WHERE s.token_hash=$1`, [sha256(token)]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return { id: row.id, accountId: row.account_id, walletId: row.wallet_id, walletAddress: row.wallet_address, chainId: Number(row.chain_id), tokenHash: row.token_hash, csrfHash: row.csrf_hash, expiresAt: row.expires_at.getTime(), revokedAt: row.revoked_at?.getTime() ?? null };
  }

  async revokeSession(id) { await (await this._getPool()).query('UPDATE app_session SET revoked_at=now() WHERE id=$1', [id]); }

  async recordAudit({ accountId = null, walletAddress = null, action, objectType, objectId, requestId, correlationId, metadata = {} }) {
    await (await this._getPool()).query(
      `INSERT INTO audit_log(id,actor_account_id,actor_wallet_address,action,object_type,object_id,request_id,correlation_id,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [`aud_${randomUUID()}`, accountId, walletAddress?.toLowerCase() ?? null, action, objectType, objectId, requestId, correlationId, JSON.stringify(metadata)]
    );
  }

  async prepareTransaction({ accountId, walletAddress, chainId, intentType, intentId, idempotencyKey, correlationId, requestId, toAddress = null, calldata = null }) {
    if (![4663, 46630, 8453, 84532].includes(Number(chainId))) throw new Error('SUPPORTED_EVM_CHAIN_REQUIRED');
    const id = `txj_${randomUUID()}`;
    const result = await (await this._getPool()).query(
      `INSERT INTO chain_transaction(id,chain_id,intent_type,intent_id,wallet_address,state,correlation_id,request_id,to_address,calldata)
       VALUES($1,$2,$3,$4,$5,'PREPARED',$6,$7,$8,$9)
       ON CONFLICT(chain_id,wallet_address,intent_type,intent_id) DO UPDATE SET updated_at=chain_transaction.updated_at
       RETURNING *`,
      [id, chainId, intentType, idempotencyKey ?? intentId, walletAddress.toLowerCase(), correlationId, requestId, toAddress?.toLowerCase() ?? null, calldata]
    );
    const transaction = result.rows[0];
    await (await this._getPool()).query(
      `INSERT INTO transaction_job(id,transaction_id,job_type) VALUES($1,$2,'CHAIN_LIFECYCLE') ON CONFLICT(transaction_id,job_type) DO NOTHING`,
      [`job_${sha256(transaction.id).slice(0, 24)}`, transaction.id]
    );
    return transaction;
  }

  async updateTransaction({ id, accountId, eventId, fromState, toState, evidence = {} }) {
    const client = await (await this._getPool()).connect();
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
          submitted_at=CASE WHEN $3='SUBMITTED' THEN COALESCE(submitted_at,now()) ELSE submitted_at END,
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

  async transaction(id, accountId, chainId = null) {
    const { rows } = await (await this._getPool()).query(
      `SELECT t.* FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id
       WHERE t.id=$1 AND w.account_id=$2 AND ($3::bigint IS NULL OR t.chain_id=$3)`, [id, accountId, chainId]
    );
    return rows[0] ?? null;
  }

  async discover() {
    const { rows } = await (await this._getPool()).query(
      `SELECT p.slug,p.builder_account_id,p.content,p.status,p.published_at,COALESCE(p.name,e.edition_id_hash) AS name,COALESCE(p.summary,'Permissionless on-chain Edition') AS summary,e.edition_address,e.absolute_supply_cap,t.price_usdg,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN project p ON e.project_id=p.id
       LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE (p.status='PUBLISHED' OR p.id IS NULL) AND e.orphaned_at IS NULL AND e.disabled IS NOT TRUE ORDER BY p.published_at DESC NULLS LAST,e.created_at DESC LIMIT 100`
    );
    return rows;
  }

  async ownedPasses(address) {
    const { rows } = await (await this._getPool()).query(
      `SELECT pt.*,e.edition_address,COALESCE(p.name,e.edition_id_hash) project_name FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id LEFT JOIN project p ON p.id=e.project_id
       WHERE pt.owner_address=$1 AND pt.orphaned_at IS NULL`, [address.toLowerCase()]
    );
    return rows;
  }

  async projectBySlug(slug) {
    const { rows } = await (await this._getPool()).query('SELECT * FROM project WHERE slug=$1 AND status=$2', [slug, 'PUBLISHED']);
    if (!rows[0]) return null;
    const editions = await (await this._getPool()).query(
      `SELECT e.*,t.version active_terms_version,t.terms_hash active_terms_hash,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE e.project_id=$1 AND e.orphaned_at IS NULL ORDER BY e.created_at`, [rows[0].id]
    );
    return { ...rows[0], editions: editions.rows };
  }

  async projectByEditionAddress(address) {
    const { rows } = await (await this._getPool()).query(
      `SELECT p.* FROM project p JOIN edition e ON e.project_id=p.id
       WHERE e.edition_address=$1 AND p.status='PUBLISHED' AND e.orphaned_at IS NULL
       ORDER BY p.updated_at DESC LIMIT 1`, [address.toLowerCase()]
    );
    if (!rows[0]) return null;
    const editions = await (await this._getPool()).query(
      `SELECT e.*,t.version active_terms_version,t.terms_hash active_terms_hash,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE e.project_id=$1 AND e.orphaned_at IS NULL ORDER BY e.created_at`, [rows[0].id]
    );
    return { ...rows[0], editions: editions.rows };
  }

  async editionByAddress(address) {
    const { rows } = await (await this._getPool()).query(
      `SELECT e.*,p.slug,COALESCE(p.name,e.edition_id_hash) AS name FROM edition e LEFT JOIN project p ON p.id=e.project_id
       WHERE e.edition_address=$1 AND e.orphaned_at IS NULL`, [address.toLowerCase()]
    );
    if (!rows[0]) return null;
    const [terms, advantages] = await Promise.all([
      (await this._getPool()).query('SELECT * FROM terms_version WHERE edition_id=$1 AND orphaned_at IS NULL ORDER BY version DESC', [rows[0].id]),
      (await this._getPool()).query('SELECT * FROM advantage_definition WHERE edition_id=$1 ORDER BY starts_at,advantage_id_hash', [rows[0].id])
    ]);
    const kind = { TIME_BASED: 0, QUANTITY_BASED: 1, CONNECTED: 2, REDEMPTION: 3 };
    return { ...rows[0], termsHistory: terms.rows.map((term) => ({ ...term, advantageConfigs: advantages.rows.filter((advantage) => advantage.terms_hash === term.terms_hash).map((advantage) => ({ advantageId: advantage.advantage_id_hash, kind: kind[advantage.kind], startsAt: Math.floor(advantage.starts_at.getTime() / 1000), endsAt: Math.floor(advantage.ends_at.getTime() / 1000), totalUnits: advantage.total_units, definitionHash: advantage.definition_hash })) })) };
  }

  async pass(editionAddress, tokenId) {
    const { rows } = await (await this._getPool()).query(
      `SELECT pt.*,e.edition_address,p.slug,COALESCE(p.name,e.edition_id_hash) AS name,t.royalty_receiver,t.royalty_bps FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id LEFT JOIN project p ON p.id=e.project_id
       LEFT JOIN terms_version t ON t.edition_id=pt.edition_id AND t.terms_hash=pt.terms_hash AND t.orphaned_at IS NULL
       WHERE e.edition_address=$1 AND pt.token_id=$2 AND pt.orphaned_at IS NULL`,
      [editionAddress.toLowerCase(), tokenId]
    );
    if (!rows[0]) return null;
    const [advantages, listing] = await Promise.all([
      (await this._getPool()).query(`SELECT a.*,d.kind,d.starts_at,d.ends_at,d.total_units,d.definition_hash,d.definition FROM advantage_state_projection a
       LEFT JOIN advantage_definition d ON d.edition_id=a.edition_id AND d.terms_hash=$3 AND d.advantage_id_hash=a.advantage_id_hash
       WHERE a.edition_id=$1 AND a.token_id=$2 AND a.orphaned_at IS NULL`, [rows[0].edition_id, tokenId, rows[0].terms_hash]),
      (await this._getPool()).query(`SELECT * FROM listing_projection WHERE edition_id=$1 AND token_id=$2 AND orphaned_at IS NULL ORDER BY updated_at DESC LIMIT 1`, [rows[0].edition_id, tokenId])
    ]);
    return { ...rows[0], advantages: advantages.rows.map((row) => { const remaining = projectedAdvantageRemaining(row); return { ...row, remaining, userFacingRemaining: remaining, consumesOnchain: ['QUANTITY_BASED', 'REDEMPTION'].includes(String(row.kind).toUpperCase()) }; }), listing: listing.rows[0] ?? null };
  }

  async listings() {
    const { rows } = await (await this._getPool()).query(
      `SELECT l.*,e.edition_address,p.name project_name,s.order_payload,s.counter,s.signature FROM listing_projection l
       JOIN edition e ON e.id=l.edition_id JOIN project p ON p.id=e.project_id
       LEFT JOIN signed_seaport_order s ON s.order_hash=l.order_hash AND s.chain_id=e.chain_id
       WHERE l.status='ACTIVE' AND l.orphaned_at IS NULL AND l.expires_at>now() ORDER BY l.updated_at DESC LIMIT 200`
    );
    return rows;
  }

  async storeSignedOrder({ accountId, chainId, orderHash, seller, order, counter, signature }) {
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO signed_seaport_order(order_hash,chain_id,seller_address,order_payload,counter,signature,submitted_by_account_id)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)
       ON CONFLICT(order_hash) DO UPDATE SET order_payload=excluded.order_payload,counter=excluded.counter,signature=excluded.signature
       WHERE signed_seaport_order.seller_address=excluded.seller_address AND signed_seaport_order.chain_id=excluded.chain_id
       RETURNING *`,
      [orderHash.toLowerCase(), chainId, seller.toLowerCase(), JSON.stringify(order), String(counter), signature, accountId]
    );
    if (!rows[0]) throw new Error('SIGNED_ORDER_CONFLICT');
    return rows[0];
  }

  async signedOrder(orderHash) {
    const { rows } = await (await this._getPool()).query(
      `SELECT s.*,l.status,l.expires_at,e.edition_address FROM signed_seaport_order s
       JOIN listing_projection l ON l.order_hash=s.order_hash JOIN edition e ON e.id=l.edition_id
       WHERE s.order_hash=$1 AND l.orphaned_at IS NULL`, [orderHash.toLowerCase()]
    );
    return rows[0] ?? null;
  }

  async listing(orderHash) {
    const { rows } = await (await this._getPool()).query(
      `SELECT l.*,e.edition_address FROM listing_projection l JOIN edition e ON e.id=l.edition_id
       WHERE l.order_hash=$1 AND l.orphaned_at IS NULL`, [orderHash.toLowerCase()]
    );
    return rows[0] ?? null;
  }

  async _builderForAccount(accountId, requestedBuilderId = null, { create = false } = {}) {
    const pool = await this._getPool();
    const requested = requestedBuilderId == null ? null : String(requestedBuilderId);
    const { rows } = await pool.query(
      `SELECT b.id,b.owner_account_id,b.created_at,b.updated_at
       FROM builder b JOIN builder_membership bm ON bm.builder_id=b.id
       LEFT JOIN builder_profile bp ON bp.builder_id=b.id
       WHERE bm.account_id=$1 AND ($2::text IS NULL OR b.id=$2 OR bp.id=$2)
       ORDER BY b.created_at ASC LIMIT 1`, [accountId, requested]
    );
    if (rows[0]) return rows[0];
    if (requested || !create) {
      if (requested) throw builderError('BUILDER_NOT_AUTHORIZED');
      return null;
    }
    const id = `bld_${randomUUID()}`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT b.id,b.owner_account_id,b.created_at,b.updated_at FROM builder b
         JOIN builder_membership bm ON bm.builder_id=b.id WHERE bm.account_id=$1
         ORDER BY b.created_at ASC LIMIT 1`, [accountId]
      );
      if (existing.rows[0]) { await client.query('COMMIT'); return existing.rows[0]; }
      const inserted = await client.query(
        `INSERT INTO builder(id,owner_account_id) VALUES($1,$2) RETURNING id,owner_account_id,created_at,updated_at`, [id, accountId]
      );
      await client.query(`INSERT INTO builder_membership(builder_id,account_id,role) VALUES($1,$2,'OWNER')`, [id, accountId]);
      await client.query('COMMIT');
      return inserted.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async _builderForIdentifier(identifier) {
    const { rows } = await (await this._getPool()).query(
      `SELECT DISTINCT b.id,b.owner_account_id,b.created_at,b.updated_at
       FROM builder b
       LEFT JOIN builder_profile bp ON bp.builder_id=b.id
       LEFT JOIN wallet w ON w.account_id=b.owner_account_id
       WHERE b.id=$1 OR bp.id=$1 OR b.owner_account_id=$1 OR LOWER(w.address)=LOWER($1)
       ORDER BY b.created_at ASC LIMIT 1`, [String(identifier ?? '')]
    );
    return rows[0] ?? null;
  }

  async listBuildersForAccount(accountId) {
    const { rows } = await (await this._getPool()).query(
      `SELECT b.id,b.owner_account_id,b.created_at,b.updated_at,bm.role,
              bp.id AS profile_id,bp.display_name,bp.bio,bp.about,bp.avatar_url,bp.category,bp.links,bp.featured
       FROM builder_membership bm JOIN builder b ON b.id=bm.builder_id
       LEFT JOIN builder_profile bp ON bp.builder_id=b.id
       WHERE bm.account_id=$1 ORDER BY b.created_at ASC`, [accountId]
    );
    return rows.map((row) => ({
      id: row.id,
      builder_id: row.id,
      owner_account_id: row.owner_account_id,
      role: row.role,
      profile: row.profile_id ? { id: row.profile_id, builder_id: row.id, account_id: row.owner_account_id, display_name: row.display_name, bio: row.bio, about: row.about, avatar_url: row.avatar_url, category: row.category, links: row.links, featured: row.featured } : null
    }));
  }

  async createBuilderIdentity(accountId, data = {}) {
    const id = `bld_${randomUUID()}`;
    const client = await (await this._getPool()).connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`INSERT INTO builder(id,owner_account_id) VALUES($1,$2) RETURNING id,owner_account_id,created_at,updated_at`, [id, accountId]);
      await client.query(`INSERT INTO builder_membership(builder_id,account_id,role) VALUES($1,$2,'OWNER')`, [id, accountId]);
      await client.query('COMMIT');
      const builder = rows[0];
      if (data.displayName || data.display_name || data.bio || data.about || data.links) builder.profile = await this.upsertBuilderProfile(accountId, data, { builderId: id });
      else builder.profile = null;
      return builder;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async recordPrimarySale(input) {
    let sale = calculatePrimarySale(input);
    if (!sale.builderId && sale.builderAccountId) {
      const builder = await this._builderForIdentifier(sale.builderAccountId);
      if (builder) sale = { ...sale, builderId: builder.id };
    }
    const key = primarySaleEventKey(sale);
    const id = `psa_${sha256(key).slice(0, 24)}`;
    const pool = await this._getPool();
    const { rows } = await pool.query(
      `INSERT INTO primary_sale_accounting(
         id,chain_id,network,tx_hash,block_number,event_index,edition_id,edition_address,terms_hash,
         builder_id,builder_account_id,buyer_address,recipient_address,first_token_id,quantity,
         gross_amount_usdg,nexmarkets_fee_usdg,builder_proceeds_usdg,referral_obligation_usdg,
         payment_token,status,evidence)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
        ON CONFLICT(chain_id,tx_hash,event_index) DO NOTHING
       RETURNING *`, [id, sale.chainId, sale.network, sale.txHash, sale.blockNumber, sale.eventIndex, sale.editionId,
        sale.editionAddress, sale.termsHash, sale.builderId, sale.builderAccountId, sale.buyerAddress,
        sale.recipientAddress, sale.firstTokenId, sale.quantity, sale.grossAmountUsdg, sale.nexmarketsFeeUsdg,
        sale.builderProceedsUsdg, sale.referralObligationUsdg, sale.paymentToken, sale.status, JSON.stringify(sale.evidence)]
    );
    if (rows[0]) return rows[0];
    const existing = await pool.query('SELECT * FROM primary_sale_accounting WHERE chain_id=$1 AND tx_hash=$2 AND event_index=$3', [sale.chainId, sale.txHash, sale.eventIndex]);
    if (!existing.rows[0]) throw new Error('PRIMARY_SALE_INSERT_RACE');
    const row = existing.rows[0];
    if (String(row.gross_amount_usdg) !== sale.grossAmountUsdg || Number(row.quantity) !== sale.quantity || String(row.edition_id ?? '') !== String(sale.editionId ?? '')) throw new Error('PRIMARY_SALE_EVENT_CONFLICT');
    return row;
  }

  async primarySalesForBuilder(builderIdentifier) {
    const builder = await this._builderForIdentifier(builderIdentifier);
    if (!builder) return [];
    const { rows } = await (await this._getPool()).query(
      `SELECT * FROM primary_sale_accounting WHERE builder_id=$1 ORDER BY block_number,event_index`, [builder.id]
    );
    return rows;
  }

  async createProject({ accountId, builderId = null, body }) {
    const builder = await this._builderForAccount(accountId, builderId, { create: true });
    const canonicalBuilderId = builder.id;
    const draftId = body.launchDraft?.draftId ?? body.draftId ?? null;
    const status = body.status ?? body.launchDraft?.status ?? 'DRAFT';
    if (draftId) {
      const existing = await (await this._getPool()).query(
        `SELECT * FROM project WHERE (builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)) AND (content->>'draftId'=$3 OR slug=$4) LIMIT 1`,
        [canonicalBuilderId, accountId, draftId, body.slug]
      );
      if (existing.rows[0]) {
        const updated = await (await this._getPool()).query(
          `UPDATE project SET name=$2, summary=$3, content=$4::jsonb, status=$5,
             published_at=CASE WHEN $5='PUBLISHED' THEN COALESCE(project.published_at,now()) ELSE project.published_at END,
             builder_id=$6, updated_at=now() WHERE id=$1 AND (builder_id=$7 OR (builder_id IS NULL AND builder_account_id=$8)) RETURNING *`,
          [existing.rows[0].id, body.name, body.summary ?? '', JSON.stringify(body.launchDraft ?? {}), status, canonicalBuilderId, canonicalBuilderId, accountId]
        );
        return updated.rows[0];
      }
    }
    const slugCheck = await (await this._getPool()).query('SELECT id, builder_id, builder_account_id FROM project WHERE slug=$1', [body.slug]);
    if (slugCheck.rows[0]) {
      if (slugCheck.rows[0].builder_id === canonicalBuilderId || (slugCheck.rows[0].builder_id == null && slugCheck.rows[0].builder_account_id === accountId)) {
        const updated = await (await this._getPool()).query(
          `UPDATE project SET name=$2, summary=$3, content=$4::jsonb, status=$5,
             published_at=CASE WHEN $5='PUBLISHED' THEN COALESCE(project.published_at,now()) ELSE project.published_at END,
             builder_id=$6, updated_at=now() WHERE id=$1 AND (builder_id=$7 OR (builder_id IS NULL AND builder_account_id=$8)) RETURNING *`,
          [slugCheck.rows[0].id, body.name, body.summary ?? '', JSON.stringify(body.launchDraft ?? {}), status, canonicalBuilderId, canonicalBuilderId, accountId]
        );
        return updated.rows[0];
      }
      throw Object.assign(new Error('SLUG_ALREADY_TAKEN'), { status: 409 });
    }
    const id = `prj_${randomUUID()}`;
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO project(id,builder_id,builder_account_id,slug,name,summary,content,status,published_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,CASE WHEN $8='PUBLISHED' THEN now() ELSE NULL END) RETURNING *`,
      [id, canonicalBuilderId, accountId, body.slug, body.name, body.summary ?? '', JSON.stringify(body.launchDraft ?? {}), status]
    );
    return rows[0];
  }

  // Link a receipt-proven Edition to the Builder's published Product. The
  // caller must have already verified the Factory event through RPC; this
  // method enforces the off-chain ownership boundary and keeps the link
  // idempotent when the indexer lands the same Edition later.
  async linkEditionToProject({ accountId, builderId = null, projectId, edition }) {
    const builder = await this._builderForAccount(accountId, builderId, { create: false });
    if (!builder) throw builderError('BUILDER_NOT_AUTHORIZED');
    const projectKey = String(projectId ?? '').trim();
    if (!projectKey) throw Object.assign(new Error('PROJECT_ID_REQUIRED'), { status: 400 });
    const address = String(edition?.edition ?? edition?.editionAddress ?? '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) throw Object.assign(new Error('EDITION_ADDRESS_REQUIRED'), { status: 400 });
    const pool = await this._getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const project = await client.query(
        `SELECT id,builder_id,builder_account_id,status FROM project
         WHERE id=$1 AND (builder_id=$2 OR (builder_id IS NULL AND builder_account_id=$3)) FOR UPDATE`,
        [projectKey, builder.id, accountId]
      );
      if (!project.rows[0]) throw builderError('PROJECT_BUILDER_MISMATCH', 403);
      // Edition creation is the first half of the permissionless publish
      // workflow. The UI persists a complete draft before asking the wallet to
      // create the Edition and only promotes that same row to PUBLISHED after
      // Terms v1 has confirmed. Permit the authenticated owner to attach a
      // receipt-proven Edition while the row is still DRAFT; projectBySlug /
      // projectByEditionAddress continue to expose only PUBLISHED rows.
      if (!['DRAFT', 'PUBLISHED'].includes(String(project.rows[0].status).toUpperCase())) throw Object.assign(new Error('PROJECT_NOT_PUBLISHABLE'), { status: 409 });
      const existing = await client.query(
        'SELECT id,project_id FROM edition WHERE chain_id=$1 AND edition_address=$2 AND orphaned_at IS NULL FOR UPDATE',
        [Number(edition.chainId), address]
      );
      if (existing.rows[0]?.project_id && existing.rows[0].project_id !== projectKey) throw Object.assign(new Error('EDITION_ALREADY_LINKED'), { status: 409 });
      const rowId = existing.rows[0]?.id ?? `ed_${sha256(`${Number(edition.chainId)}:${address}`).slice(0, 24)}`;
      const values = [
        rowId, projectKey, Number(edition.chainId), address, String(edition.editionId).toLowerCase(), String(edition.factoryAddress).toLowerCase(),
        String(edition.publisherAddress ?? edition.publisher).toLowerCase(), Number(edition.absoluteSupplyCap), String(edition.artworkCommitment).toLowerCase(),
        Number(edition.blockNumber), String(edition.blockHash).toLowerCase(), String(edition.txHash).toLowerCase(), Number(edition.logIndex)
      ];
      const linked = await client.query(
        `INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index,finalized)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false)
         ON CONFLICT(chain_id,edition_address) DO UPDATE SET project_id=COALESCE(edition.project_id,EXCLUDED.project_id),orphaned_at=NULL
         RETURNING *`, values
      );
      await client.query('COMMIT');
      return linked.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async saveTermsCommitment({ builderAccountId, builderId = null, editionAddress, advantagesHash, termsPayload, configs }) {
    const builder = await this._builderForAccount(builderAccountId, builderId, { create: true });
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO terms_advantage_commitment(advantages_hash,builder_account_id,builder_id,edition_address,terms_payload,configs)
       VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)
       ON CONFLICT(advantages_hash) DO UPDATE SET builder_account_id=excluded.builder_account_id,builder_id=excluded.builder_id,terms_payload=excluded.terms_payload,configs=excluded.configs,status='PREPARED',updated_at=now()
       RETURNING *`,
      [advantagesHash.toLowerCase(), builderAccountId, builder.id, editionAddress.toLowerCase(), JSON.stringify(termsPayload), JSON.stringify(configs ?? [])]
    );
    return rows[0];
  }

  async termsCommitmentsForEdition(editionAddress) {
    const { rows } = await (await this._getPool()).query(
      `SELECT advantages_hash, terms_payload, configs, created_at, updated_at
       FROM terms_advantage_commitment WHERE LOWER(edition_address)=LOWER($1)
       ORDER BY created_at ASC`, [String(editionAddress ?? '')]
    );
    return rows.map((row) => ({
      advantagesHash: row.advantages_hash,
      advantages_hash: row.advantages_hash,
      termsPayload: row.terms_payload,
      configs: row.configs ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async createMedia({ accountId, metadata }) {
    const id = `med_${randomUUID()}`;
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO media_asset(id,owner_account_id,storage_key,original_filename,mime_type,byte_size,sha256,safety_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(owner_account_id,sha256) DO UPDATE SET
         original_filename=excluded.original_filename,
         mime_type=excluded.mime_type,
         byte_size=excluded.byte_size,
         deleted_at=NULL
       RETURNING *`,
      [id, accountId, metadata.storageKey, metadata.filename, metadata.mimeType, metadata.byteSize, metadata.sha256, 'PENDING']
    );
    return rows[0];
  }

  async mediaById(id) {
    const { rows } = await (await this._getPool()).query('SELECT * FROM media_asset WHERE id=$1 AND deleted_at IS NULL', [id]);
    return rows[0] ?? null;
  }

  async mediaByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const { rows } = await (await this._getPool()).query('SELECT * FROM media_asset WHERE id=ANY($1::text[]) AND deleted_at IS NULL', [ids]);
    return rows;
  }

  async approveMedia({ id, accountId, publicUrl, width, height, mimeType, byteSize, sha256 }) {
    const { rows } = await (await this._getPool()).query(
      `UPDATE media_asset SET safety_status='APPROVED',upload_status='UPLOADED',public_url=$3,width=$4,height=$5,mime_type=$6,byte_size=$7,sha256=$8,uploaded_at=now(),verified_at=now()
       WHERE id=$1 AND owner_account_id=$2 AND deleted_at IS NULL RETURNING *`,
      [id, accountId, publicUrl, width, height, mimeType, byteSize, sha256]
    );
    return rows[0] ?? null;
  }

  async advantagesForOwner(address) {
    const { rows } = await (await this._getPool()).query(
      `SELECT a.*,d.kind,d.starts_at,d.ends_at,d.total_units,p.token_id,e.edition_address,p.terms_hash FROM advantage_state_projection a
       JOIN pass_token_projection p ON p.edition_id=a.edition_id AND p.token_id=a.token_id
       JOIN edition e ON e.id=a.edition_id
       LEFT JOIN advantage_definition d ON d.edition_id=a.edition_id AND d.advantage_id_hash=a.advantage_id_hash AND d.terms_hash=p.terms_hash
       WHERE p.owner_address=$1 AND p.orphaned_at IS NULL AND a.orphaned_at IS NULL`,
      [address.toLowerCase()]
    );
    return rows.map((row) => { const remaining = projectedAdvantageRemaining(row); return { ...row, remaining, userFacingRemaining: remaining, consumesOnchain: ['QUANTITY_BASED', 'REDEMPTION'].includes(String(row.kind).toUpperCase()) }; });
  }

  async builderDashboard(accountId, { builderId = null } = {}) {
    const builder = await this._builderForAccount(accountId, builderId, { create: false });
    const canonicalBuilderId = builder?.id ?? null;
    if (!canonicalBuilderId) return { builder: null, projects: [], editions: [], royalties: [], referrals: [], primarySales: [], earnings: aggregatePrimarySales([]), activity: [] };
    const pool = await this._getPool();
    const builderFilter = `(p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2))`;
    const [projects, editions, royalties, referrals, sales, activity, profile] = await Promise.all([
      pool.query(`SELECT * FROM project p WHERE p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2) ORDER BY p.updated_at DESC`, [canonicalBuilderId, accountId]),
      pool.query(`SELECT DISTINCT e.* FROM edition e JOIN project p ON p.id=e.project_id WHERE ${builderFilter} AND e.orphaned_at IS NULL`, [canonicalBuilderId, accountId]),
      pool.query(`SELECT r.* FROM royalty_claim_projection r JOIN edition e ON e.id=r.edition_id JOIN project p ON p.id=e.project_id WHERE ${builderFilter} AND r.orphaned_at IS NULL`, [canonicalBuilderId, accountId]),
      pool.query(`SELECT s.* FROM referral_settlement s WHERE (s.builder_id=$1 OR (s.builder_id IS NULL AND s.builder_account_id=$2)) ORDER BY s.created_at DESC`, [canonicalBuilderId, accountId]),
      pool.query(`SELECT * FROM primary_sale_accounting WHERE builder_id=$1 ORDER BY block_number,event_index`, [canonicalBuilderId]),
      this.getActivityByBuilder(canonicalBuilderId, { limit: 50 }),
      pool.query(`SELECT * FROM builder_profile WHERE builder_id=$1 LIMIT 1`, [canonicalBuilderId])
    ]);
    const earnings = aggregatePrimarySales(sales.rows);
    return { builder: { ...builder, profile: profile.rows[0] ?? null }, projects: projects.rows, editions: editions.rows, royalties: royalties.rows, referrals: referrals.rows, primarySales: sales.rows, earnings, activity };
  }

  async claimOutbox(limit = 50) {
    const { rows } = await (await this._getPool()).query(
      `WITH claimed AS (
         SELECT id FROM outbox_event WHERE delivered_at IS NULL AND dead_at IS NULL
          AND available_at<=now() AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes')
         ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT $1
       ) UPDATE outbox_event o SET locked_at=now() FROM claimed WHERE o.id=claimed.id RETURNING o.*`, [limit]
    );
    return rows.map((row) => ({ ...row, eventType: row.event_type, businessKey: row.business_key, deliveredAt: row.delivered_at }));
  }

  async enqueueNotification(event) {
    const client = await (await this._getPool()).connect();
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
    await (await this._getPool()).query('UPDATE outbox_event SET delivered_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND delivered_at IS NULL', [id]);
  }

  async markOutboxFailed(id, { attempt, dead, delaySeconds, error }) {
    await (await this._getPool()).query(
      `UPDATE outbox_event SET attempt=$2,locked_at=NULL,last_error=$3,
       available_at=now()+($4::text||' seconds')::interval,dead_at=CASE WHEN $5 THEN now() ELSE dead_at END
       WHERE id=$1 AND delivered_at IS NULL`, [id, attempt, String(error).slice(0, 1000), delaySeconds, dead]
    );
  }

  async startRun(scope) {
    const id = `rec_${randomUUID()}`;
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO reconciliation_run(id,chain_id,scope,status) VALUES($1,$2,$3,'RUNNING') RETURNING *`,
      [id, scope.chainId ?? 4663, JSON.stringify(scope)]
    );
    return rows[0];
  }

  async recordIncident(incident) {
    const id = `inc_${randomUUID()}`;
    await (await this._getPool()).query(
      `INSERT INTO reconciliation_incident(id,run_id,authority,object_key,severity,expected,observed,status,repair_action)
       VALUES($1,$2,$3,$4,'HIGH',$5::jsonb,$6::jsonb,'OPEN',$7)`,
      [id, incident.runId, incident.authority ?? 'CHAIN', `${incident.objectKey}:${incident.check}`,
        JSON.stringify(incident.expected ?? null), JSON.stringify(incident.observed ?? { error: incident.error }), incident.repairAction]
    );
  }

  async finishRun(id, status, result) {
    await (await this._getPool()).query(
      `UPDATE reconciliation_run SET status=$2,checked_count=$3,discrepancy_count=$4,evidence=$5::jsonb,finished_at=now() WHERE id=$1`,
      [id, status, result.checkedCount ?? 0, result.discrepancies.length, JSON.stringify(result)]
    );
  }

  // --- Social layer ---

  async getBuilderProfile(identifier) {
    const { rows } = await (await this._getPool()).query(
      `SELECT bp.*, b.owner_account_id, b.created_at AS builder_created_at, w.address AS wallet_address, a.created_at AS joined_at,
       (SELECT count(*)::int FROM builder_follow bf WHERE bf.builder_id=bp.builder_id OR (bf.builder_id IS NULL AND bf.builder_account_id=bp.account_id)) AS follower_count,
       (SELECT count(*)::int FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL) AS editions_count,
       (SELECT count(*)::int FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND pt.orphaned_at IS NULL) AS passes_issued,
       (SELECT count(DISTINCT pt.owner_address)::int FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND pt.orphaned_at IS NULL) AS active_holders,
       (SELECT COALESCE(sum(ps.gross_amount_usdg),0)::text FROM primary_sale_accounting ps WHERE ps.builder_id=bp.builder_id AND ps.status='CONFIRMED') AS total_volume_usdg
       FROM builder_profile bp
       JOIN builder b ON b.id=bp.builder_id
       JOIN account a ON a.id=b.owner_account_id
       LEFT JOIN LATERAL (SELECT address FROM wallet WHERE account_id=b.owner_account_id ORDER BY created_at ASC LIMIT 1) w ON true
       WHERE bp.builder_id=$1 OR bp.id=$1 OR b.owner_account_id=$1 OR LOWER(w.address)=LOWER($1) OR LOWER(COALESCE(bp.links->>'handle',''))=LOWER($1)`, [String(identifier ?? '')]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      ...r,
      stats: {
        editionsCount: r.editions_count,
        passesIssued: r.passes_issued,
        activeHolders: r.active_holders,
        totalVolumeUsdg: r.total_volume_usdg ?? '0'
      }
    };
  }

  async upsertBuilderProfile(accountId, data, { builderId = null } = {}) {
    const builder = await this._builderForAccount(accountId, builderId, { create: true });
    const id = `bprf_${randomUUID()}`;
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO builder_profile(id,builder_id,account_id,display_name,bio,about,avatar_url,category,links)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (builder_id) DO UPDATE SET
         display_name=COALESCE(NULLIF($4,''),builder_profile.display_name),
         bio=COALESCE(NULLIF($5,''),builder_profile.bio),
         about=COALESCE(NULLIF($6,''),builder_profile.about),
         avatar_url=COALESCE(NULLIF($7,''),builder_profile.avatar_url),
         category=COALESCE(NULLIF($8,''),builder_profile.category),
         links=CASE WHEN $9::jsonb='{}'::jsonb THEN builder_profile.links ELSE $9::jsonb END,
         account_id=EXCLUDED.account_id,
         updated_at=now()
       RETURNING *`,
      [id, builder.id, accountId, data.displayName ?? '', data.bio ?? '', data.about ?? '', data.avatarUrl ?? '', data.category ?? '', JSON.stringify(data.links ?? {})]
    );
    return rows[0];
  }

  async followBuilder(followerAccountId, builderAccountId) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) throw Object.assign(new Error('BUILDER_NOT_FOUND'), { status: 404 });
    if (builder.owner_account_id === followerAccountId) throw Object.assign(new Error('SELF_FOLLOW_REJECTED'), { status: 400 });
    const id = `bfl_${randomUUID()}`;
    await (await this._getPool()).query(
      `INSERT INTO builder_follow(id,follower_account_id,builder_account_id,builder_id) VALUES($1,$2,$3,$4) ON CONFLICT(follower_account_id,builder_id) DO NOTHING`,
      [id, followerAccountId, builder.owner_account_id, builder.id]
    );
    const { rows } = await (await this._getPool()).query(
      `SELECT count(*)::int AS cnt FROM builder_follow WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)`, [builder.id, builder.owner_account_id]
    );
    return { followed: true, followerCount: rows[0].cnt };
  }

  async unfollowBuilder(followerAccountId, builderAccountId) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) return { unfollowed: true, followerCount: 0 };
    await (await this._getPool()).query(
      `DELETE FROM builder_follow WHERE follower_account_id=$1 AND (builder_id=$2 OR (builder_id IS NULL AND builder_account_id=$3))`,
      [followerAccountId, builder.id, builder.owner_account_id]
    );
    const { rows } = await (await this._getPool()).query(
      `SELECT count(*)::int AS cnt FROM builder_follow WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)`, [builder.id, builder.owner_account_id]
    );
    return { unfollowed: true, followerCount: rows[0].cnt };
  }

  async getFollowStatus(followerAccountId, builderAccountId) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) return { isFollowing: false, followerCount: 0, isHolder: false };
    const pool = await this._getPool();
    const [followRow, countRow, holderRow] = await Promise.all([
      pool.query(`SELECT 1 FROM builder_follow WHERE follower_account_id=$1 AND (builder_id=$2 OR (builder_id IS NULL AND builder_account_id=$3)) LIMIT 1`, [followerAccountId, builder.id, builder.owner_account_id]),
      pool.query(`SELECT count(*)::int AS cnt FROM builder_follow WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)`, [builder.id, builder.owner_account_id]),
      pool.query(
        `SELECT 1 FROM pass_token_projection pt
         JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id
         WHERE pt.owner_address IN (SELECT w.address FROM wallet w WHERE w.account_id=$1)
         AND (p.builder_id=$2 OR (p.builder_id IS NULL AND p.builder_account_id=$3)) AND pt.orphaned_at IS NULL LIMIT 1`,
        [followerAccountId, builder.id, builder.owner_account_id]
      )
    ]);
    return { isFollowing: followRow.rows.length > 0, followerCount: countRow.rows[0].cnt, isHolder: holderRow.rows.length > 0 };
  }

  async getFollowedBuilders(accountId) {
    const { rows } = await (await this._getPool()).query(
      `SELECT bf.builder_id, bf.builder_account_id, bf.created_at AS followed_at, bp.id AS profile_id, bp.display_name, bp.bio, bp.avatar_url, bp.category
       FROM builder_follow bf LEFT JOIN builder_profile bp ON bp.builder_id=bf.builder_id
       WHERE bf.follower_account_id=$1 ORDER BY bf.created_at DESC`, [accountId]
    );
    return rows;
  }

  async watchProject(accountId, slug) {
    const project = await (await this._getPool()).query(`SELECT id FROM project WHERE slug=$1`, [slug]);
    if (!project.rows[0]) throw Object.assign(new Error('PROJECT_NOT_FOUND'), { status: 404 });
    const projectId = project.rows[0].id;
    const id = `pwl_${randomUUID()}`;
    await (await this._getPool()).query(
      `INSERT INTO project_watchlist(id,account_id,project_id) VALUES($1,$2,$3) ON CONFLICT(account_id,project_id) DO NOTHING`,
      [id, accountId, projectId]
    );
    const { rows } = await (await this._getPool()).query(`SELECT count(*)::int AS cnt FROM project_watchlist WHERE project_id=$1`, [projectId]);
    return { watching: true, watcherCount: rows[0].cnt };
  }

  async unwatchProject(accountId, slug) {
    const project = await (await this._getPool()).query(`SELECT id FROM project WHERE slug=$1`, [slug]);
    if (!project.rows[0]) throw Object.assign(new Error('PROJECT_NOT_FOUND'), { status: 404 });
    const projectId = project.rows[0].id;
    await (await this._getPool()).query(`DELETE FROM project_watchlist WHERE account_id=$1 AND project_id=$2`, [accountId, projectId]);
    const { rows } = await (await this._getPool()).query(`SELECT count(*)::int AS cnt FROM project_watchlist WHERE project_id=$1`, [projectId]);
    return { unwatched: true, watcherCount: rows[0].cnt };
  }

  async getWatchlist(accountId) {
    const { rows } = await (await this._getPool()).query(
      `SELECT pw.*, p.slug, p.name, p.summary,
       (SELECT count(*)::int FROM project_watchlist x WHERE x.project_id=pw.project_id) AS watcher_count
       FROM project_watchlist pw JOIN project p ON p.id=pw.project_id
       WHERE pw.account_id=$1 ORDER BY pw.created_at DESC`, [accountId]
    );
    return rows;
  }

  async createMilestone(builderAccountId, payload) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) throw Object.assign(new Error('BUILDER_NOT_FOUND'), { status: 404 });
    if (!payload.title?.trim()) throw Object.assign(new Error('MILESTONE_TITLE_REQUIRED'), { status: 400 });
    if (!payload.content?.trim()) throw Object.assign(new Error('MILESTONE_CONTENT_REQUIRED'), { status: 400 });
    const cadence = await (await this._getPool()).query(
      `SELECT 1 FROM builder_milestone WHERE (builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2))
       AND (project_id=$3 OR ($3::text IS NULL AND project_id IS NULL))
       AND created_at > now() - interval '7 days' LIMIT 1`,
      [builder.id, builder.owner_account_id, payload.projectId ?? null]
    );
    if (cadence.rows[0]) throw Object.assign(new Error('MILESTONE_CADENCE_EXCEEDED'), { status: 429 });
    const id = `bms_${randomUUID()}`;
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO builder_milestone(id,builder_account_id,builder_id,project_id,title,content,links) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [id, builder.owner_account_id, builder.id, payload.projectId ?? null, payload.title.trim(), payload.content.trim(), JSON.stringify(payload.links ?? [])]
    );
    return rows[0];
  }

  async getMilestonesByBuilder(builderAccountId, { limit = 20 } = {}) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) return [];
    const { rows } = await (await this._getPool()).query(
      `SELECT * FROM builder_milestone WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2) ORDER BY created_at DESC LIMIT $3`,
      [builder.id, builder.owner_account_id, limit]
    );
    return rows;
  }

  async createQuestion(askerAccountId, builderAccountId, payload) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) throw Object.assign(new Error('BUILDER_NOT_FOUND'), { status: 404 });
    const question = String(payload.question ?? payload.content ?? '').trim().slice(0, 800);
    if (question.length < 3) throw Object.assign(new Error('QUESTION_REQUIRED'), { status: 400 });
    const id = `bq_${randomUUID()}`;
    const { rows } = await (await this._getPool()).query(
      `INSERT INTO builder_question(id,builder_account_id,builder_id,asker_account_id,question) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [id, builder.owner_account_id, builder.id, askerAccountId, question]
    );
    return rows[0];
  }

  async answerQuestion(builderAccountId, questionId, payload) {
    const answer = String(payload.answer ?? payload.content ?? '').trim().slice(0, 1200);
    if (!answer) throw Object.assign(new Error('ANSWER_REQUIRED'), { status: 400 });
    const owner = await (await this._getPool()).query(
      `SELECT b.owner_account_id FROM builder_question q LEFT JOIN builder b ON b.id=q.builder_id WHERE q.id=$1`, [questionId]
    );
    if (!owner.rows[0] || owner.rows[0].owner_account_id !== builderAccountId) throw Object.assign(new Error('QUESTION_NOT_FOUND'), { status: 404 });
    const { rows } = await (await this._getPool()).query(
      `UPDATE builder_question SET answer=$2,answered_at=now() WHERE id=$1 RETURNING *`,
      [questionId, answer]
    );
    if (!rows[0]) throw Object.assign(new Error('QUESTION_NOT_FOUND'), { status: 404 });
    return rows[0];
  }

  async getQuestionsByBuilder(builderAccountId, { limit = 50 } = {}) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) return [];
    const { rows } = await (await this._getPool()).query(
      `SELECT * FROM builder_question WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2) ORDER BY created_at DESC LIMIT $3`,
      [builder.id, builder.owner_account_id, limit]
    );
    return rows;
  }

  async getActivityByBuilder(builderAccountId, { limit = 20 } = {}) {
    const builder = await this._builderForIdentifier(builderAccountId);
    if (!builder) return [];
    const canonicalBuilderId = builder.id;
    const ownerAccountId = builder.owner_account_id;
    const pool = await this._getPool();
    const [milestones, debuts, sales, holders] = await Promise.all([
      pool.query(`SELECT id, 'MILESTONE' AS type, title, content, links, created_at FROM builder_milestone WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2) ORDER BY created_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit]),
      pool.query(`SELECT e.id, 'NEW_DEBUT' AS type, p.name AS title, p.summary AS content, '[]'::jsonb AS links, e.created_at FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2)) AND e.orphaned_at IS NULL ORDER BY e.created_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit]),
      pool.query(`SELECT l.order_hash AS id, 'SECONDARY_SALE' AS type, ('Pass #' || l.token_id || ' Sold') AS title, (l.price_usdg || ' USDG') AS content, '[]'::jsonb AS links, l.updated_at AS created_at FROM listing_projection l JOIN edition e ON e.id=l.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2)) AND l.status='FILLED' AND l.orphaned_at IS NULL ORDER BY l.updated_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit]),
      pool.query(`SELECT (pt.edition_id || '_' || pt.token_id) AS id, 'NEW_HOLDER' AS type, ('New Holder for #' || pt.token_id) AS title, pt.owner_address AS content, '[]'::jsonb AS links, pt.updated_at AS created_at FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2)) AND pt.orphaned_at IS NULL ORDER BY pt.updated_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit])
    ]);
    const combined = [...milestones.rows, ...debuts.rows, ...sales.rows, ...holders.rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
    return combined;
  }

  async getFeed(accountId, { limit = 50 } = {}) {
    const { rows } = await (await this._getPool()).query(
      `WITH followed AS (
         SELECT builder_account_id FROM builder_follow WHERE follower_account_id=$1
         UNION
         SELECT p.builder_account_id FROM pass_token_projection pt
         JOIN edition e ON e.id=pt.edition_id
         JOIN project p ON p.id=e.project_id
         WHERE pt.owner_address IN (SELECT address FROM wallet WHERE account_id=$1)
           AND pt.orphaned_at IS NULL
       )
       SELECT bm.*, 'MILESTONE' AS type, bp.display_name AS builder_display_name, bp.avatar_url AS builder_avatar_url
       FROM builder_milestone bm
       JOIN followed f ON f.builder_account_id=bm.builder_account_id
       LEFT JOIN builder_profile bp ON bp.account_id=bm.builder_account_id
       ORDER BY bm.created_at DESC LIMIT $2`,
      [accountId, limit]
    );
    return rows;
  }

  async getHolders(editionAddress, { limit = 100 } = {}) {
    const { rows } = await (await this._getPool()).query(
      `SELECT pt.owner_address, pt.token_id, pt.updated_at AS held_since, pt.minted_block_number
       FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id
       WHERE e.edition_address=$1 AND pt.orphaned_at IS NULL
       ORDER BY pt.token_id ASC LIMIT $2`,
      [editionAddress.toLowerCase(), limit]
    );
    return rows;
  }

  async getPlatformStats() {
    const pool = await this._getPool();
    const [passes, holders, volume] = await Promise.all([
      pool.query(`SELECT count(*)::int AS cnt FROM pass_token_projection WHERE orphaned_at IS NULL`),
      pool.query(`SELECT count(DISTINCT owner_address)::int AS cnt FROM pass_token_projection WHERE orphaned_at IS NULL`),
      pool.query(`SELECT COALESCE(sum(price_usdg),0)::text AS vol FROM listing_projection WHERE status='FILLED' AND orphaned_at IS NULL`)
    ]);
    return { passesIssued: passes.rows[0].cnt, activeHolders: holders.rows[0].cnt, totalVolumeUsdg: volume.rows[0].vol };
  }

  async getWatchlistCount(projectIdOrSlug) {
    const { rows } = await (await this._getPool()).query(
      `SELECT count(*)::int AS cnt FROM project_watchlist pw
       JOIN project p ON p.id=pw.project_id
       WHERE p.id=$1 OR p.slug=$1`, [projectIdOrSlug]
    );
    return rows[0]?.cnt ?? 0;
  }

  async getFeaturedBuilders({ limit = 4 } = {}) {
    const { rows } = await (await this._getPool()).query(
      `SELECT bp.*,b.owner_account_id,
       (SELECT count(*)::int FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL) AS editions_count,
       (SELECT count(*)::int FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND pt.orphaned_at IS NULL) AS passes_issued,
       (SELECT e.absolute_supply_cap FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL ORDER BY e.created_at DESC LIMIT 1) AS supply_cap,
       (SELECT t.price_usdg::text FROM edition e JOIN project p ON p.id=e.project_id LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL ORDER BY e.created_at DESC LIMIT 1) AS price_usdg,
       (SELECT p.slug FROM project p WHERE p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id) ORDER BY p.updated_at DESC LIMIT 1) AS project_slug,
       (SELECT COALESCE(sum(ps.gross_amount_usdg),0)::text FROM primary_sale_accounting ps WHERE ps.builder_id=bp.builder_id AND ps.status='CONFIRMED') AS total_volume_usdg
       FROM builder_profile bp JOIN builder b ON b.id=bp.builder_id WHERE bp.featured=true LIMIT $1`,
      [limit]
    );
    return rows;
  }
}
