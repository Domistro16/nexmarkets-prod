var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// apps/api/src/memory-store.mjs
import { createHash as createHash3, randomUUID as randomUUID4 } from "node:crypto";
function hash2(value) {
  return createHash3("sha256").update(value).digest("hex");
}
var MemoryStore;
var init_memory_store = __esm({
  "apps/api/src/memory-store.mjs"() {
    MemoryStore = class {
      constructor() {
        this.challenges = /* @__PURE__ */ new Map();
        this.sessions = /* @__PURE__ */ new Map();
        this.transactions = /* @__PURE__ */ new Map();
        this.projects = [];
        this.editions = [];
        this.passes = [];
        this.listingRows = [];
        this.signedOrders = /* @__PURE__ */ new Map();
        this.editionRequests = [];
        this.termsCommitments = /* @__PURE__ */ new Map();
        this.media = [];
      }
      async ready() {
        return true;
      }
      async indexerHealth() {
        return { latest_block_number: 1, latest_event_block_number: 1, landed_block_number: 1, finalized_block_number: 1, finalized_watermark_block_number: 1 };
      }
      async close() {
      }
      async saveChallenge(challenge) {
        this.challenges.set(challenge.nonce, structuredClone(challenge));
      }
      async challenge(nonce) {
        return structuredClone(this.challenges.get(nonce) ?? null);
      }
      async consumeChallengeAndCreateSession({ challenge, session, signature }) {
        const stored = this.challenges.get(challenge.nonce);
        if (!stored || stored.consumedAt) throw new Error("CHALLENGE_ALREADY_USED_OR_EXPIRED");
        stored.consumedAt = Date.now();
        stored.signature = signature;
        const accountId = `acct_${hash2(challenge.address).slice(0, 24)}`;
        const walletId = `wal_${hash2(`${challenge.chainId}:${challenge.address}`).slice(0, 24)}`;
        this.sessions.set(session.tokenHash, { ...session, accountId, walletId, walletAddress: challenge.address, chainId: challenge.chainId });
        return { accountId, walletId };
      }
      async sessionByToken(token) {
        return structuredClone(this.sessions.get(hash2(token)) ?? null);
      }
      async revokeSession(id2) {
        for (const session of this.sessions.values()) if (session.id === id2) session.revokedAt = Date.now();
      }
      async recordAudit() {
      }
      async prepareTransaction(input) {
        const existing = [...this.transactions.values()].find((tx2) => tx2.accountId === input.accountId && tx2.intentType === input.intentType && tx2.idempotencyKey === input.idempotencyKey);
        if (existing) return structuredClone(existing);
        const tx = { id: `txj_${randomUUID4()}`, state: "PREPARED", createdAt: (/* @__PURE__ */ new Date()).toISOString(), ...input };
        this.transactions.set(tx.id, tx);
        return structuredClone(tx);
      }
      async updateTransaction({ id: id2, accountId, eventId, fromState, toState, evidence = {} }) {
        const tx = this.transactions.get(id2);
        if (!tx || tx.accountId !== accountId || tx.state !== fromState) throw new Error("TRANSACTION_STATE_CONFLICT");
        tx.appliedEvents ??= /* @__PURE__ */ new Map();
        if (tx.appliedEvents.has(eventId)) return structuredClone(tx);
        if (fromState === toState) throw new Error("TRANSACTION_DUPLICATE_STATE");
        tx.state = toState;
        Object.assign(tx, evidence);
        tx.appliedEvents.set(eventId, true);
        const result = { ...tx };
        delete result.appliedEvents;
        return structuredClone(result);
      }
      async transaction(id2, accountId) {
        const tx = this.transactions.get(id2);
        return tx?.accountId === accountId ? structuredClone(tx) : null;
      }
      async discover() {
        return structuredClone(this.projects.filter((project) => project.status === "PUBLISHED"));
      }
      async projectBySlug(slug) {
        return structuredClone(this.projects.find((project) => project.slug === slug) ?? null);
      }
      async editionByAddress(address2) {
        return structuredClone(this.editions.find((edition) => edition.editionAddress === address2.toLowerCase()) ?? null);
      }
      async pass(edition, tokenId) {
        return structuredClone(this.passes.find((pass) => pass.editionAddress === edition.toLowerCase() && String(pass.tokenId) === String(tokenId)) ?? null);
      }
      async listings() {
        return structuredClone(this.listingRows.filter((listing) => listing.status === "ACTIVE"));
      }
      async storeSignedOrder(input) {
        this.signedOrders.set(input.orderHash.toLowerCase(), structuredClone(input));
        return structuredClone(input);
      }
      async signedOrder(orderHash) {
        const signed = this.signedOrders.get(orderHash.toLowerCase());
        if (!signed) return null;
        const listing = this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase());
        return structuredClone({ ...signed, status: listing?.status ?? "ACTIVE", expires_at: listing?.expires_at ?? listing?.expiresAt });
      }
      async listing(orderHash) {
        return structuredClone(this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase()) ?? null);
      }
      async ownedPasses(address2) {
        return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address2.toLowerCase()));
      }
      async advantagesForOwner(address2) {
        return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address2.toLowerCase()).flatMap((pass) => pass.advantages ?? []));
      }
      async builderDashboard(accountId) {
        return { projects: structuredClone(this.projects.filter((project) => project.builderAccountId === accountId)), editions: [], royalties: [], referrals: [] };
      }
      async createProject({ accountId, body }) {
        const draftId = body.launchDraft?.draftId ?? body.draftId ?? null;
        const existing = this.projects.find(
          (project2) => project2.builderAccountId === accountId && (draftId && (project2.content?.draftId === draftId || project2.launchDraft?.draftId === draftId) || project2.slug === body.slug)
        );
        if (existing) {
          existing.name = body.name;
          existing.summary = body.summary ?? "";
          existing.content = structuredClone(body.launchDraft ?? {});
          existing.launchDraft = structuredClone(body.launchDraft ?? {});
          existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          return structuredClone(existing);
        }
        const slugConflict = this.projects.find((project2) => project2.slug === body.slug && project2.builderAccountId !== accountId);
        if (slugConflict) {
          throw Object.assign(new Error("SLUG_ALREADY_TAKEN"), { status: 409 });
        }
        const id2 = `prj_${randomUUID4()}`;
        const project = {
          id: id2,
          builderAccountId: accountId,
          builder_account_id: accountId,
          slug: body.slug,
          name: body.name,
          summary: body.summary ?? "",
          content: structuredClone(body.launchDraft ?? {}),
          launchDraft: structuredClone(body.launchDraft ?? {}),
          status: "DRAFT",
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.projects.push(project);
        return structuredClone(project);
      }
      async createEditionRequest({ projectId, builderAccountId, chainId, payload, transactionId = null }) {
        const project = this.projects.find((item) => item.id === projectId && item.builderAccountId === builderAccountId);
        if (!project) throw new Error("PROJECT_BUILDER_MISMATCH");
        const request = { id: `edreq_${randomUUID4()}`, projectId, builderAccountId, chainId, transactionId, editionIdHash: payload.editionId, requestPayload: payload, predictedEditionAddress: payload.predictedEditionAddress ?? null, safeStatus: "REQUESTED" };
        this.editionRequests.push(request);
        return structuredClone(request);
      }
      async markEditionRequestSafePending(id2, builderAccountId) {
        const request = this.editionRequests.find((item) => item.id === id2 && item.builderAccountId === builderAccountId && item.safeStatus !== "REJECTED");
        if (!request) throw new Error("EDITION_REQUEST_STATE_CONFLICT");
        if (request.safeStatus === "REQUESTED") request.safeStatus = "SAFE_PENDING";
        return structuredClone(request);
      }
      async saveTermsCommitment(input) {
        this.termsCommitments.set(input.advantagesHash.toLowerCase(), structuredClone(input));
        return structuredClone(input);
      }
      async editionRequestById(id2, builderAccountId) {
        return structuredClone(this.editionRequests.find((request) => request.id === id2 && request.builderAccountId === builderAccountId) ?? null);
      }
      async submitEditionRequest({ id: id2, safeTransactionHash, txHash, evidence = null }) {
        const existing = this.editionRequests.find((item) => item.id === id2);
        if (existing?.safeStatus === "SUBMITTED" && existing.txHash === txHash) return structuredClone(existing);
        const request = existing && ["SAFE_PENDING", "REQUESTED"].includes(existing.safeStatus) ? existing : null;
        if (!request) throw new Error("EDITION_REQUEST_STATE_CONFLICT");
        Object.assign(request, { safeStatus: "SUBMITTED", safeTransactionHash, txHash, safeExecutionEvidence: evidence });
        return structuredClone(request);
      }
      async createMedia({ accountId, metadata }) {
        const row = { id: `med_${randomUUID4()}`, ownerAccountId: accountId, ...metadata };
        this.media.push(row);
        return structuredClone(row);
      }
    };
  }
});

// packages/data/src/postgres-store.mjs
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function projectedAdvantageRemaining(row, now = Math.floor(Date.now() / 1e3)) {
  const kind = String(row.kind ?? "").toUpperCase();
  const starts = row.starts_at ? Math.floor(new Date(row.starts_at).getTime() / 1e3) : 0;
  const ends = row.ends_at ? Math.floor(new Date(row.ends_at).getTime() / 1e3) : 0;
  let effective = Math.max(0, now - Number(row.frozen_seconds ?? 0));
  if (kind === "TIME_BASED" && row.listed && row.listed_at) {
    const listedTimestamp = Math.floor(new Date(row.listed_at).getTime() / 1e3) - Number(row.frozen_seconds ?? 0);
    if (listedTimestamp < ends) effective = effective < Math.max(listedTimestamp, starts) ? effective : Math.max(listedTimestamp, starts);
  }
  if (effective < starts || effective >= ends) return "0";
  if (kind === "TIME_BASED") return String(ends - effective);
  if (kind === "CONNECTED") return "1";
  return String(row.remaining_units ?? 0);
}
var PostgresStore = class {
  constructor({ connectionString = process.env.DATABASE_URL, pool } = {}) {
    if (!pool && !connectionString) throw new Error("DATABASE_URL is required");
    this.pool = pool ?? new pg.Pool({ connectionString, max: 10, application_name: "nexmarkets-api" });
    this.ownsPool = !pool;
  }
  async ready() {
    await this.pool.query("SELECT 1");
    return true;
  }
  async indexerHealth(chainId) {
    const { rows } = await this.pool.query("SELECT * FROM indexer_checkpoint WHERE chain_id=$1 ORDER BY updated_at DESC LIMIT 1", [chainId]);
    return rows[0] ?? null;
  }
  async chainHead(chain) {
    return chain?.getBlockNumber ? chain.getBlockNumber() : null;
  }
  async close() {
    if (this.ownsPool) await this.pool.end();
  }
  async saveChallenge(challenge) {
    await this.pool.query(
      `INSERT INTO wallet_challenge(nonce,account_id,wallet_address,origin,domain,chain_id,message,issued_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0))`,
      [challenge.nonce, challenge.accountId, challenge.address, challenge.origin, challenge.domain, challenge.chainId, challenge.message, challenge.issuedAt, challenge.expiresAt]
    );
  }
  async challenge(nonce) {
    const { rows } = await this.pool.query("SELECT * FROM wallet_challenge WHERE nonce=$1", [nonce]);
    if (!rows[0]) return null;
    const row = rows[0];
    return { accountId: row.account_id, address: row.wallet_address, nonce: row.nonce, origin: row.origin, domain: row.domain, chainId: Number(row.chain_id), message: row.message, issuedAt: row.issued_at.getTime(), expiresAt: row.expires_at.getTime(), consumedAt: row.consumed_at?.getTime() ?? null };
  }
  async consumeChallengeAndCreateSession({ challenge, session, signature }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const consumed = await client.query(
        `UPDATE wallet_challenge SET consumed_at=now(),signature=$2 WHERE nonce=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING nonce`,
        [challenge.nonce, signature]
      );
      if (!consumed.rowCount) throw new Error("CHALLENGE_ALREADY_USED_OR_EXPIRED");
      const accountId = `acct_${sha256(challenge.address).slice(0, 24)}`;
      const walletId = `wal_${sha256(`${challenge.chainId}:${challenge.address}`).slice(0, 24)}`;
      await client.query("INSERT INTO account(id) VALUES($1) ON CONFLICT(id) DO NOTHING", [accountId]);
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
      await client.query("COMMIT");
      return { accountId, walletId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async sessionByToken(token) {
    const { rows } = await this.pool.query(
      `SELECT s.*,w.address wallet_address,w.chain_id FROM app_session s JOIN wallet w ON w.id=s.wallet_id
       WHERE s.token_hash=$1`,
      [sha256(token)]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return { id: row.id, accountId: row.account_id, walletId: row.wallet_id, walletAddress: row.wallet_address, chainId: Number(row.chain_id), tokenHash: row.token_hash, csrfHash: row.csrf_hash, expiresAt: row.expires_at.getTime(), revokedAt: row.revoked_at?.getTime() ?? null };
  }
  async revokeSession(id2) {
    await this.pool.query("UPDATE app_session SET revoked_at=now() WHERE id=$1", [id2]);
  }
  async recordAudit({ accountId = null, walletAddress = null, action, objectType, objectId, requestId, correlationId, metadata = {} }) {
    await this.pool.query(
      `INSERT INTO audit_log(id,actor_account_id,actor_wallet_address,action,object_type,object_id,request_id,correlation_id,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [`aud_${randomUUID()}`, accountId, walletAddress?.toLowerCase() ?? null, action, objectType, objectId, requestId, correlationId, JSON.stringify(metadata)]
    );
  }
  async prepareTransaction({ accountId, walletAddress, chainId, intentType, intentId, idempotencyKey, correlationId, requestId, toAddress = null, calldata = null }) {
    if (![4663, 46630].includes(Number(chainId))) throw new Error("ROBINHOOD_CHAIN_REQUIRED");
    const id2 = `txj_${randomUUID()}`;
    const result = await this.pool.query(
      `INSERT INTO chain_transaction(id,chain_id,intent_type,intent_id,wallet_address,state,correlation_id,request_id,to_address,calldata)
       VALUES($1,$2,$3,$4,$5,'PREPARED',$6,$7,$8,$9)
       ON CONFLICT(chain_id,wallet_address,intent_type,intent_id) DO UPDATE SET updated_at=chain_transaction.updated_at
       RETURNING *`,
      [id2, chainId, intentType, idempotencyKey ?? intentId, walletAddress.toLowerCase(), correlationId, requestId, toAddress?.toLowerCase() ?? null, calldata]
    );
    const transaction = result.rows[0];
    await this.pool.query(
      `INSERT INTO transaction_job(id,transaction_id,job_type) VALUES($1,$2,'CHAIN_LIFECYCLE') ON CONFLICT(transaction_id,job_type) DO NOTHING`,
      [`job_${sha256(transaction.id).slice(0, 24)}`, transaction.id]
    );
    return transaction;
  }
  async updateTransaction({ id: id2, accountId, eventId, fromState, toState, evidence = {} }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingEvent = await client.query("SELECT transaction_id FROM transaction_event WHERE event_id=$1", [eventId]);
      if (existingEvent.rowCount) {
        const existing = await client.query(
          `SELECT t.* FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id
           WHERE t.id=$1 AND w.account_id=$2`,
          [existingEvent.rows[0].transaction_id, accountId]
        );
        await client.query("COMMIT");
        return existing.rows[0] ?? null;
      }
      if (fromState === toState) throw new Error("TRANSACTION_DUPLICATE_STATE");
      const updated = await client.query(
        `UPDATE chain_transaction t SET state=$3,tx_hash=COALESCE($4,tx_hash),block_number=COALESCE($5,block_number),
          block_hash=COALESCE($6,block_hash),confirmations=COALESCE($7,confirmations),
          submitted_at=CASE WHEN $3='SUBMITTED' THEN COALESCE(submitted_at,now()) ELSE submitted_at END,
          finalized_at=CASE WHEN $3='FINALIZED' THEN COALESCE($8,now()) ELSE finalized_at END,
          failure_code=COALESCE($9,failure_code),updated_at=now()
         FROM wallet w WHERE t.id=$1 AND w.address=t.wallet_address AND w.chain_id=t.chain_id
          AND w.account_id=$2 AND t.state=$10 RETURNING t.*`,
        [
          id2,
          accountId,
          toState,
          evidence.txHash ?? null,
          evidence.blockNumber ?? null,
          evidence.blockHash ?? null,
          evidence.confirmations ?? null,
          evidence.finalizedAt ?? null,
          evidence.failureCode ?? null,
          fromState
        ]
      );
      if (!updated.rowCount) throw new Error("TRANSACTION_STATE_CONFLICT");
      await client.query(
        `INSERT INTO transaction_event(event_id,transaction_id,from_state,to_state,evidence) VALUES($1,$2,$3,$4,$5::jsonb)`,
        [eventId, id2, fromState, toState, JSON.stringify(evidence)]
      );
      await client.query("COMMIT");
      return updated.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async transaction(id2, accountId) {
    const { rows } = await this.pool.query(
      `SELECT t.* FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id
       WHERE t.id=$1 AND w.account_id=$2`,
      [id2, accountId]
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
  async ownedPasses(address2) {
    const { rows } = await this.pool.query(
      `SELECT pt.*,e.edition_address,p.name project_name FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id
       WHERE pt.owner_address=$1 AND pt.orphaned_at IS NULL`,
      [address2.toLowerCase()]
    );
    return rows;
  }
  async projectBySlug(slug) {
    const { rows } = await this.pool.query("SELECT * FROM project WHERE slug=$1 AND status=$2", [slug, "PUBLISHED"]);
    if (!rows[0]) return null;
    const editions = await this.pool.query(
      `SELECT e.*,t.version active_terms_version,t.terms_hash active_terms_hash,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE e.project_id=$1 AND e.orphaned_at IS NULL ORDER BY e.created_at`,
      [rows[0].id]
    );
    return { ...rows[0], editions: editions.rows };
  }
  async editionByAddress(address2) {
    const { rows } = await this.pool.query(
      `SELECT e.*,p.slug,p.name FROM edition e JOIN project p ON p.id=e.project_id
       WHERE e.edition_address=$1 AND e.orphaned_at IS NULL`,
      [address2.toLowerCase()]
    );
    if (!rows[0]) return null;
    const [terms, advantages] = await Promise.all([
      this.pool.query("SELECT * FROM terms_version WHERE edition_id=$1 AND orphaned_at IS NULL ORDER BY version DESC", [rows[0].id]),
      this.pool.query("SELECT * FROM advantage_definition WHERE edition_id=$1 ORDER BY starts_at,advantage_id_hash", [rows[0].id])
    ]);
    const kind = { TIME_BASED: 0, QUANTITY_BASED: 1, CONNECTED: 2, REDEMPTION: 3 };
    return { ...rows[0], termsHistory: terms.rows.map((term) => ({ ...term, advantageConfigs: advantages.rows.filter((advantage) => advantage.terms_hash === term.terms_hash).map((advantage) => ({ advantageId: advantage.advantage_id_hash, kind: kind[advantage.kind], startsAt: Math.floor(advantage.starts_at.getTime() / 1e3), endsAt: Math.floor(advantage.ends_at.getTime() / 1e3), totalUnits: advantage.total_units, definitionHash: advantage.definition_hash })) })) };
  }
  async pass(editionAddress, tokenId) {
    const { rows } = await this.pool.query(
      `SELECT pt.*,e.edition_address,p.slug,p.name,t.royalty_receiver,t.royalty_bps FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id
       LEFT JOIN terms_version t ON t.edition_id=pt.edition_id AND t.terms_hash=pt.terms_hash AND t.orphaned_at IS NULL
       WHERE e.edition_address=$1 AND pt.token_id=$2 AND pt.orphaned_at IS NULL`,
      [editionAddress.toLowerCase(), tokenId]
    );
    if (!rows[0]) return null;
    const [advantages, listing] = await Promise.all([
      this.pool.query(`SELECT a.*,d.kind,d.starts_at,d.ends_at,d.total_units,d.definition_hash,d.definition FROM advantage_state_projection a
       LEFT JOIN advantage_definition d ON d.edition_id=a.edition_id AND d.terms_hash=$3 AND d.advantage_id_hash=a.advantage_id_hash
       WHERE a.edition_id=$1 AND a.token_id=$2 AND a.orphaned_at IS NULL`, [rows[0].edition_id, tokenId, rows[0].terms_hash]),
      this.pool.query(`SELECT * FROM listing_projection WHERE edition_id=$1 AND token_id=$2 AND orphaned_at IS NULL ORDER BY updated_at DESC LIMIT 1`, [rows[0].edition_id, tokenId])
    ]);
    return { ...rows[0], advantages: advantages.rows.map((row) => {
      const remaining = projectedAdvantageRemaining(row);
      return { ...row, remaining, userFacingRemaining: remaining, consumesOnchain: ["QUANTITY_BASED", "REDEMPTION"].includes(String(row.kind).toUpperCase()) };
    }), listing: listing.rows[0] ?? null };
  }
  async listings() {
    const { rows } = await this.pool.query(
      `SELECT l.*,e.edition_address,p.name project_name,s.order_payload,s.counter,s.signature FROM listing_projection l
       JOIN edition e ON e.id=l.edition_id JOIN project p ON p.id=e.project_id
       LEFT JOIN signed_seaport_order s ON s.order_hash=l.order_hash AND s.chain_id=e.chain_id
       WHERE l.status='ACTIVE' AND l.orphaned_at IS NULL AND l.expires_at>now() ORDER BY l.updated_at DESC LIMIT 200`
    );
    return rows;
  }
  async storeSignedOrder({ accountId, chainId, orderHash, seller, order, counter, signature }) {
    const { rows } = await this.pool.query(
      `INSERT INTO signed_seaport_order(order_hash,chain_id,seller_address,order_payload,counter,signature,submitted_by_account_id)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)
       ON CONFLICT(order_hash) DO UPDATE SET order_payload=excluded.order_payload,counter=excluded.counter,signature=excluded.signature
       WHERE signed_seaport_order.seller_address=excluded.seller_address AND signed_seaport_order.chain_id=excluded.chain_id
       RETURNING *`,
      [orderHash.toLowerCase(), chainId, seller.toLowerCase(), JSON.stringify(order), String(counter), signature, accountId]
    );
    if (!rows[0]) throw new Error("SIGNED_ORDER_CONFLICT");
    return rows[0];
  }
  async signedOrder(orderHash) {
    const { rows } = await this.pool.query(
      `SELECT s.*,l.status,l.expires_at,e.edition_address FROM signed_seaport_order s
       JOIN listing_projection l ON l.order_hash=s.order_hash JOIN edition e ON e.id=l.edition_id
       WHERE s.order_hash=$1 AND l.orphaned_at IS NULL`,
      [orderHash.toLowerCase()]
    );
    return rows[0] ?? null;
  }
  async listing(orderHash) {
    const { rows } = await this.pool.query(
      `SELECT l.*,e.edition_address FROM listing_projection l JOIN edition e ON e.id=l.edition_id
       WHERE l.order_hash=$1 AND l.orphaned_at IS NULL`,
      [orderHash.toLowerCase()]
    );
    return rows[0] ?? null;
  }
  async createProject({ accountId, body }) {
    const draftId = body.launchDraft?.draftId ?? body.draftId ?? null;
    if (draftId) {
      const existing = await this.pool.query(
        `SELECT * FROM project WHERE builder_account_id=$1 AND (content->>'draftId'=$2 OR slug=$3) LIMIT 1`,
        [accountId, draftId, body.slug]
      );
      if (existing.rows[0]) {
        const updated = await this.pool.query(
          `UPDATE project SET name=$2, summary=$3, content=$4::jsonb, updated_at=now() WHERE id=$1 AND builder_account_id=$5 RETURNING *`,
          [existing.rows[0].id, body.name, body.summary ?? "", JSON.stringify(body.launchDraft ?? {}), accountId]
        );
        return updated.rows[0];
      }
    }
    const slugCheck = await this.pool.query("SELECT id, builder_account_id FROM project WHERE slug=$1", [body.slug]);
    if (slugCheck.rows[0]) {
      if (slugCheck.rows[0].builder_account_id === accountId) {
        const updated = await this.pool.query(
          `UPDATE project SET name=$2, summary=$3, content=$4::jsonb, updated_at=now() WHERE id=$1 AND builder_account_id=$5 RETURNING *`,
          [slugCheck.rows[0].id, body.name, body.summary ?? "", JSON.stringify(body.launchDraft ?? {}), accountId]
        );
        return updated.rows[0];
      }
      throw Object.assign(new Error("SLUG_ALREADY_TAKEN"), { status: 409 });
    }
    const id2 = `prj_${randomUUID()}`;
    const { rows } = await this.pool.query(
      `INSERT INTO project(id,builder_account_id,slug,name,summary,content) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
      [id2, accountId, body.slug, body.name, body.summary ?? "", JSON.stringify(body.launchDraft ?? {})]
    );
    return rows[0];
  }
  async createEditionRequest({ projectId, builderAccountId, chainId, payload, transactionId = null }) {
    const id2 = `edreq_${randomUUID()}`;
    const { rows } = await this.pool.query(
      `INSERT INTO edition_request(id,project_id,builder_account_id,chain_id,edition_id_hash,request_payload,predicted_edition_address,safe_status,transaction_id)
       SELECT $1,p.id,$3,$4,$5,$6::jsonb,$8,'REQUESTED',$7 FROM project p
       WHERE p.id=$2 AND p.builder_account_id=$3
       ON CONFLICT(chain_id,edition_id_hash) DO UPDATE SET updated_at=now()
       WHERE edition_request.builder_account_id=EXCLUDED.builder_account_id AND edition_request.project_id=EXCLUDED.project_id
       RETURNING *`,
      [id2, projectId, builderAccountId, chainId, String(payload.editionId).toLowerCase(), JSON.stringify(payload), transactionId, payload.predictedEditionAddress?.toLowerCase() ?? null]
    );
    if (!rows[0]) throw new Error("PROJECT_BUILDER_MISMATCH");
    return rows[0];
  }
  async markEditionRequestSafePending(id2, builderAccountId) {
    const { rows } = await this.pool.query(`UPDATE edition_request SET safe_status='SAFE_PENDING',updated_at=now() WHERE id=$1 AND builder_account_id=$2 AND safe_status='REQUESTED' RETURNING *`, [id2, builderAccountId]);
    if (rows[0]) return rows[0];
    const existing = await this.pool.query("SELECT * FROM edition_request WHERE id=$1 AND builder_account_id=$2 AND safe_status NOT IN ('REJECTED')", [id2, builderAccountId]);
    if (!existing.rows[0]) throw new Error("EDITION_REQUEST_STATE_CONFLICT");
    return existing.rows[0];
  }
  async saveTermsCommitment({ builderAccountId, editionAddress, advantagesHash, termsPayload, configs }) {
    const { rows } = await this.pool.query(
      `INSERT INTO terms_advantage_commitment(advantages_hash,builder_account_id,edition_address,terms_payload,configs)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb)
       ON CONFLICT(advantages_hash) DO UPDATE SET terms_payload=excluded.terms_payload,configs=excluded.configs,status='PREPARED',updated_at=now()
       RETURNING *`,
      [advantagesHash.toLowerCase(), builderAccountId, editionAddress.toLowerCase(), JSON.stringify(termsPayload), JSON.stringify(configs ?? [])]
    );
    return rows[0];
  }
  async editionRequestById(id2, builderAccountId) {
    const { rows } = await this.pool.query("SELECT * FROM edition_request WHERE id=$1 AND builder_account_id=$2", [id2, builderAccountId]);
    return rows[0] ?? null;
  }
  async submitEditionRequest({ id: id2, safeTransactionHash, txHash, evidence = null }) {
    const { rows } = await this.pool.query(
      `UPDATE edition_request SET safe_status='SUBMITTED',safe_transaction_hash=$2,tx_hash=$3,safe_execution_evidence=$4::jsonb,updated_at=now()
       WHERE id=$1 AND safe_status IN ('SAFE_PENDING','REQUESTED') RETURNING *`,
      [id2, safeTransactionHash, txHash, JSON.stringify(evidence ?? {})]
    );
    if (!rows[0]) {
      const existing = await this.pool.query("SELECT * FROM edition_request WHERE id=$1", [id2]);
      if (existing.rows[0]?.safe_status === "SUBMITTED" && existing.rows[0].tx_hash === txHash) return existing.rows[0];
      throw new Error("EDITION_REQUEST_STATE_CONFLICT");
    }
    return rows[0];
  }
  async createMedia({ accountId, metadata }) {
    const id2 = `med_${randomUUID()}`;
    const { rows } = await this.pool.query(
      `INSERT INTO media_asset(id,owner_account_id,storage_key,original_filename,mime_type,byte_size,sha256,safety_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id2, accountId, metadata.storageKey, metadata.filename, metadata.mimeType, metadata.byteSize, metadata.sha256, "PENDING"]
    );
    return rows[0];
  }
  async advantagesForOwner(address2) {
    const { rows } = await this.pool.query(
      `SELECT a.*,d.kind,d.starts_at,d.ends_at,d.total_units,p.token_id,e.edition_address,p.terms_hash FROM advantage_state_projection a
       JOIN pass_token_projection p ON p.edition_id=a.edition_id AND p.token_id=a.token_id
       JOIN edition e ON e.id=a.edition_id
       LEFT JOIN advantage_definition d ON d.edition_id=a.edition_id AND d.advantage_id_hash=a.advantage_id_hash AND d.terms_hash=p.terms_hash
       WHERE p.owner_address=$1 AND p.orphaned_at IS NULL AND a.orphaned_at IS NULL`,
      [address2.toLowerCase()]
    );
    return rows.map((row) => {
      const remaining = projectedAdvantageRemaining(row);
      return { ...row, remaining, userFacingRemaining: remaining, consumesOnchain: ["QUANTITY_BASED", "REDEMPTION"].includes(String(row.kind).toUpperCase()) };
    });
  }
  async builderDashboard(accountId) {
    const [projects, editions, royalties, referrals] = await Promise.all([
      this.pool.query("SELECT * FROM project WHERE builder_account_id=$1 ORDER BY updated_at DESC", [accountId]),
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
       ) UPDATE outbox_event o SET locked_at=now() FROM claimed WHERE o.id=claimed.id RETURNING o.*`,
      [limit]
    );
    return rows.map((row) => ({ ...row, eventType: row.event_type, businessKey: row.business_key, deliveredAt: row.delivered_at }));
  }
  async enqueueNotification(event) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const notificationId = `not_${sha256(`${event.type}:${event.businessKey}:${event.accountId ?? ""}`).slice(0, 24)}`;
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
      await client.query("COMMIT");
      return { notificationId, outboxId: event.id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async markOutboxDelivered(id2) {
    await this.pool.query("UPDATE outbox_event SET delivered_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND delivered_at IS NULL", [id2]);
  }
  async markOutboxFailed(id2, { attempt, dead, delaySeconds, error }) {
    await this.pool.query(
      `UPDATE outbox_event SET attempt=$2,locked_at=NULL,last_error=$3,
       available_at=now()+($4::text||' seconds')::interval,dead_at=CASE WHEN $5 THEN now() ELSE dead_at END
       WHERE id=$1 AND delivered_at IS NULL`,
      [id2, attempt, String(error).slice(0, 1e3), delaySeconds, dead]
    );
  }
  async startRun(scope) {
    const id2 = `rec_${randomUUID()}`;
    const { rows } = await this.pool.query(
      `INSERT INTO reconciliation_run(id,chain_id,scope,status) VALUES($1,$2,$3,'RUNNING') RETURNING *`,
      [id2, scope.chainId ?? 4663, JSON.stringify(scope)]
    );
    return rows[0];
  }
  async recordIncident(incident) {
    const id2 = `inc_${randomUUID()}`;
    await this.pool.query(
      `INSERT INTO reconciliation_incident(id,run_id,authority,object_key,severity,expected,observed,status,repair_action)
       VALUES($1,$2,$3,$4,'HIGH',$5::jsonb,$6::jsonb,'OPEN',$7)`,
      [
        id2,
        incident.runId,
        incident.authority ?? "CHAIN",
        `${incident.objectKey}:${incident.check}`,
        JSON.stringify(incident.expected ?? null),
        JSON.stringify(incident.observed ?? { error: incident.error }),
        incident.repairAction
      ]
    );
  }
  async finishRun(id2, status, result) {
    await this.pool.query(
      `UPDATE reconciliation_run SET status=$2,checked_count=$3,discrepancy_count=$4,evidence=$5::jsonb,finished_at=now() WHERE id=$1`,
      [id2, status, result.checkedCount ?? 0, result.discrepancies.length, JSON.stringify(result)]
    );
  }
};

// packages/chain/src/keccak.mjs
var MASK = (1n << 64n) - 1n;

// packages/chain/src/rpc.mjs
var JsonRpcClient = class {
  constructor(url, { timeoutMs = 12e3 } = {}) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.id = 0;
  }
  async call(method, params = []) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }), signal: controller.signal });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }
  chainId() {
    return this.call("eth_chainId").then((x) => Number(BigInt(x)));
  }
  getBlockNumber() {
    return this.call("eth_blockNumber").then((value) => Number(BigInt(value)));
  }
  getBlockByNumber(blockNumber) {
    return this.call("eth_getBlockByNumber", [`0x${BigInt(blockNumber).toString(16)}`, false]);
  }
  getTransactionReceipt(txHash) {
    return this.call("eth_getTransactionReceipt", [txHash]);
  }
  getTransactionByHash(txHash) {
    return this.call("eth_getTransactionByHash", [txHash]);
  }
  getCode(address2, block = "latest") {
    return this.call("eth_getCode", [address2, block]);
  }
  getStorageAt(address2, slot, block = "latest") {
    return this.call("eth_getStorageAt", [address2, slot, block]);
  }
  ethCall(to, data, block = "latest") {
    return this.call("eth_call", [{ to, data }, block]);
  }
};

// packages/subgraph-client/src/index.mjs
var DEFAULT_TIMEOUT_MS = 1e4;
function asNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : value;
}
function unix(value) {
  return value == null ? null : Number(value);
}
function advantageRemaining(advantage, now = Math.floor(Date.now() / 1e3)) {
  if (!advantage) return "0";
  const kind = String(advantage.kind ?? "").toUpperCase();
  const starts = unix(advantage.startsAt) ?? 0;
  const ends = unix(advantage.endsAt) ?? 0;
  const frozen = asNumber(advantage.frozenSeconds, 0);
  let effective = Math.max(0, now - frozen);
  if (kind === "TIME_BASED" && advantage.listed && advantage.listedAt != null) {
    const listed = (unix(advantage.listedAt) ?? 0) - frozen;
    if (listed < ends) {
      const freezeAt = Math.max(listed, starts);
      effective = effective < freezeAt ? effective : freezeAt;
    }
  }
  if (effective < starts || effective >= ends) return "0";
  if (kind === "TIME_BASED") return String(Math.max(0, ends - effective));
  if (kind === "CONNECTED") return "1";
  return String(advantage.remainingUnits ?? advantage.totalUnits ?? 0);
}
var SubgraphClient = class {
  constructor({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, logger = console, certificationEditionAddress = null, certificationEditionName = null } = {}) {
    this.endpoint = endpoint?.trim() || null;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.certificationEditionAddress = lower(certificationEditionAddress);
    this.certificationEditionName = certificationEditionName;
  }
  get enabled() {
    return Boolean(this.endpoint);
  }
  async query(query, variables = {}, { cacheBust = false } = {}) {
    if (!this.endpoint) throw new Error("SUBGRAPH_ENDPOINT_REQUIRED");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const endpoint = cacheBust ? `${this.endpoint}${this.endpoint.includes("?") ? "&" : "?"}_nexmarkets_meta=${Date.now()}` : this.endpoint;
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "cache-control": cacheBust ? "no-cache" : "no-cache" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`SUBGRAPH_HTTP_${response.status}`);
      if (body.errors?.length) throw new Error(`SUBGRAPH_QUERY_ERROR:${body.errors[0].message}`);
      return body.data ?? {};
    } finally {
      clearTimeout(timer);
    }
  }
  async indexingStatus() {
    const data = await this.query("{ _meta { block { number hash } deployment } }", {}, { cacheBust: true });
    const block = data._meta?.block ?? {};
    return { indexedBlock: asNumber(block.number, 0), blockHash: lower(block.hash ?? null), deployment: data._meta?.deployment ?? null };
  }
  async discover({ first = 100 } = {}) {
    const data = await this.query(`query($first:Int!){ editions(first:$first,orderBy:createdBlock,orderDirection:desc){ id address editionId publisher absoluteSupplyCap totalMinted disabled currentTerms { hash pricePerPass previewStartsAt mintStartsAt mintEndsAt } createdBlock createdTimestamp createdTx } }`, { first });
    return (data.editions ?? []).map((edition) => {
      const address2 = lower(edition.address);
      const name = address2 === this.certificationEditionAddress && this.certificationEditionName ? this.certificationEditionName : `NexPass Edition ${address2?.slice(0, 10) ?? ""}`;
      const currentTerms = normalizeTerms(edition.currentTerms ?? {});
      return {
        slug: address2,
        name,
        summary: `${edition.totalMinted ?? "0"}/${edition.absoluteSupplyCap ?? "0"} serials minted \xB7 ${edition.disabled ? "disabled" : "onchain"}`,
        status: edition.disabled ? "Disabled" : "Edition",
        edition_address: address2,
        edition_id: lower(edition.editionId),
        publisher: lower(edition.publisher),
        absolute_supply_cap: edition.absoluteSupplyCap,
        total_minted: edition.totalMinted,
        disabled: edition.disabled,
        active_terms_hash: lower(edition.currentTerms?.hash ?? null),
        price_usdg: edition.currentTerms?.pricePerPass ?? null,
        preview_starts_at: iso(currentTerms.previewStartsAt),
        mint_starts_at: iso(currentTerms.mintStartsAt),
        mint_ends_at: iso(currentTerms.mintEndsAt),
        created_block: edition.createdBlock,
        created_tx: lower(edition.createdTx)
      };
    });
  }
  async editionByAddress(address2) {
    const data = await this.query(`query($address:Bytes!){ editions(where:{address:$address}){ id address editionId publisher protocolAdmin mintController absoluteSupplyCap artworkCommitment totalMinted disabled currentTerms { id hash version activeSupply pricePerPass previewStartsAt mintStartsAt mintEndsAt primaryRecipient royaltyReceiver royaltyBps advantagesHash referralTermsHash blockNumber timestamp transactionHash } terms(orderBy:version,orderDirection:desc){ id hash version activeSupply pricePerPass previewStartsAt mintStartsAt mintEndsAt primaryRecipient royaltyReceiver royaltyBps advantagesHash referralTermsHash } } }`, { address: lower(address2) });
    const edition = data.editions?.[0];
    if (!edition) return null;
    const normalizedAddress = lower(edition.address);
    const normalizedTerms = (edition.terms ?? []).map(normalizeTerms);
    const currentTerms = edition.currentTerms ? normalizeTerms(edition.currentTerms) : null;
    return {
      ...edition,
      id: normalizedAddress,
      name: normalizedAddress === this.certificationEditionAddress && this.certificationEditionName ? this.certificationEditionName : `NexPass Edition ${normalizedAddress.slice(0, 10)}`,
      address: normalizedAddress,
      edition_address: normalizedAddress,
      editionId: lower(edition.editionId),
      edition_id: lower(edition.editionId),
      publisher: lower(edition.publisher),
      protocolAdmin: lower(edition.protocolAdmin),
      mintController: lower(edition.mintController),
      artworkCommitment: lower(edition.artworkCommitment),
      absolute_supply_cap: edition.absoluteSupplyCap,
      currentTerms,
      termsHistory: normalizedTerms
    };
  }
  async pass(edition, tokenId) {
    const id2 = `${lower(edition)}-${tokenId}`;
    const data = await this.query(`query($tokenId:BigInt!){ passes(where:{tokenId:$tokenId}){ id tokenId owner termsHash mintBlock mintTimestamp mintTransactionHash royaltyReceiver royaltyBps listed edition { address editionId publisher } advantages { id advantageId kind startsAt endsAt totalUnits remainingUnits frozenSeconds listed listedAt definitionHash termsHash } tba { account implementation registry } } }`, { tokenId: String(tokenId) });
    const pass = data.passes?.find((candidate) => String(candidate.id).toLowerCase() === id2.toLowerCase()) ?? data.passes?.[0] ?? null;
    if (!pass) return null;
    const owner = lower(pass.owner);
    const normalizedEdition = { ...pass.edition, address: lower(pass.edition.address), editionId: lower(pass.edition.editionId), publisher: lower(pass.edition.publisher) };
    const advantages = (pass.advantages ?? []).map((advantage) => {
      const remaining = advantageRemaining(advantage);
      return { ...advantage, advantageId: lower(advantage.advantageId), advantage_id_hash: lower(advantage.advantageId), termsHash: lower(advantage.termsHash), terms_hash: lower(advantage.termsHash), definitionHash: lower(advantage.definitionHash), definition_hash: lower(advantage.definitionHash), remainingUnits: advantage.remainingUnits, remaining_units: advantage.remainingUnits, userFacingRemaining: remaining, remaining, consumesOnchain: ["QUANTITY_BASED", "REDEMPTION"].includes(String(advantage.kind).toUpperCase()) };
    });
    const tba = pass.tba ? { ...pass.tba, account: lower(pass.tba.account), implementation: lower(pass.tba.implementation), registry: lower(pass.tba.registry) } : null;
    return {
      ...pass,
      token_id: pass.tokenId,
      owner,
      owner_address: owner,
      termsHash: lower(pass.termsHash),
      terms_hash: lower(pass.termsHash),
      edition: normalizedEdition,
      edition_address: normalizedEdition.address,
      name: normalizedEdition.address === this.certificationEditionAddress && this.certificationEditionName ? this.certificationEditionName : `NexPass Edition ${normalizedEdition.address.slice(0, 10)}`,
      advantages,
      tba,
      token_bound_account: tba?.account ?? null
    };
  }
  async listings({ first = 100, status = "ACTIVE" } = {}) {
    const data = await this.query(`query($first:Int!,$status:String!){ listings(first:$first,where:{status:$status},orderBy:createdBlock,orderDirection:desc){ id orderHash tokenId seller termsHash price royaltyReceiver royaltyBps startTime expiry zoneHash status buyer salePrice protocolFee builderRoyalty sellerProceeds edition { address editionId } } }`, { first, status });
    return (data.listings ?? []).map(normalizeListing);
  }
  async listing(orderHash) {
    const data = await this.query(`query($id:ID!){ listing(id:$id){ id orderHash tokenId seller termsHash price royaltyReceiver royaltyBps startTime expiry zoneHash status buyer salePrice protocolFee builderRoyalty sellerProceeds edition { address editionId } } }`, { id: lower(orderHash) });
    const listing = data.listing;
    if (!listing) return null;
    return normalizeListing(listing);
  }
};
function normalizeTerms(terms) {
  const previewStartsAt = unix(terms.previewStartsAt);
  const mintStartsAt = unix(terms.mintStartsAt);
  const mintEndsAt = unix(terms.mintEndsAt);
  return { ...terms, hash: lower(terms.hash), primaryRecipient: lower(terms.primaryRecipient), royaltyReceiver: lower(terms.royaltyReceiver), advantagesHash: lower(terms.advantagesHash), referralTermsHash: lower(terms.referralTermsHash), previewStartsAt, mintStartsAt, mintEndsAt, price_usdg: terms.pricePerPass, preview_starts_at: iso(previewStartsAt), mint_starts_at: iso(mintStartsAt), mint_ends_at: iso(mintEndsAt), terms_hash: lower(terms.hash), primary_recipient: lower(terms.primaryRecipient), royalty_receiver: lower(terms.royaltyReceiver), royalty_bps: terms.royaltyBps, advantages_hash: lower(terms.advantagesHash), referral_terms_hash: lower(terms.referralTermsHash) };
}
function iso(value) {
  return value == null ? null : new Date(Number(value) * 1e3).toISOString();
}
function normalizeListing(listing) {
  return { ...listing, order_hash: lower(listing.orderHash), edition_address: lower(listing.edition.address), token_id: listing.tokenId, seller_address: lower(listing.seller), terms_hash: lower(listing.termsHash), price_usdg: listing.price, royalty_receiver: lower(listing.royaltyReceiver), royalty_bps: listing.royaltyBps, starts_at: unix(listing.startTime), expires_at: unix(listing.expiry), zone_hash: lower(listing.zoneHash), buyer: lower(listing.buyer) };
}

// apps/api/src/server.mjs
import http from "node:http";
import { randomUUID as randomUUID3 } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AbiCoder as AbiCoder2, concat as concat2, getAddress as getAddress3, getCreate2Address, id, Interface as Interface3, isAddress as isAddress2, keccak256 as keccak2563, toUtf8Bytes as toUtf8Bytes3 } from "ethers";

// packages/auth/src/wallet-challenge.mjs
import { randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
function issueWalletChallenge({ accountId, address: address2, origin, chainId = 4663, ttlSeconds = 300, now = Date.now() }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address2)) throw new Error("Invalid EVM address");
  if (!origin) throw new Error("origin required");
  if (![4663, 46630].includes(chainId)) throw new Error("Robinhood chain required");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("secure origin required");
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = now + ttlSeconds * 1e3;
  const message = [
    `${url.host} wants you to sign in with your Ethereum account:`,
    getAddress(address2),
    "",
    "Sign in to NexMarkets. This request does not submit a transaction.",
    "",
    `URI: ${url.origin}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(expiresAt).toISOString()}`,
    `Request ID: ${accountId}`
  ].join("\n");
  return { accountId, address: getAddress(address2).toLowerCase(), nonce, origin: url.origin, domain: url.host, chainId, message, issuedAt: now, expiresAt, consumedAt: null };
}
function assertChallengeUsable(challenge, { accountId, address: address2, origin, chainId = challenge.chainId, now = Date.now() }) {
  if (challenge.consumedAt) throw new Error("Wallet challenge already consumed");
  if (now > challenge.expiresAt) throw new Error("Wallet challenge expired");
  if (challenge.accountId !== accountId) throw new Error("Wallet challenge account mismatch");
  if (challenge.origin !== new URL(origin).origin) throw new Error("Wallet challenge origin mismatch");
  if (challenge.chainId !== chainId) throw new Error("Wallet challenge chain mismatch");
  const a = Buffer.from(challenge.address);
  const b = Buffer.from(address2.toLowerCase());
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Wallet challenge address mismatch");
  return true;
}
function verifyWalletChallengeSignature(challenge, signature) {
  if (typeof signature !== "string" || !signature.startsWith("0x")) throw new Error("signature required");
  const recovered = verifyMessage(challenge.message, signature).toLowerCase();
  if (recovered !== challenge.address) throw new Error("Wallet signature mismatch");
  return recovered;
}

// packages/auth/src/session.mjs
import { createHash as createHash2, randomBytes as randomBytes2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
function hash(value) {
  return createHash2("sha256").update(value).digest("hex");
}
function issueSession({ accountId, walletId, ttlSeconds = 60 * 60 * 24 * 7, now = Date.now() }) {
  if (!accountId || !walletId) throw new Error("session identity required");
  const token = randomBytes2(32).toString("base64url");
  const csrfToken = randomBytes2(32).toString("base64url");
  return {
    record: {
      id: `ses_${randomBytes2(16).toString("hex")}`,
      accountId,
      walletId,
      tokenHash: hash(token),
      csrfHash: hash(csrfToken),
      expiresAt: now + ttlSeconds * 1e3,
      revokedAt: null
    },
    token,
    csrfToken
  };
}
function assertSession(session, token, { csrfToken, mutation = false, now = Date.now() } = {}) {
  if (!session || session.revokedAt || now >= session.expiresAt) throw new Error("SESSION_INVALID");
  const expected = Buffer.from(session.tokenHash, "hex");
  const actual = Buffer.from(hash(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual2(expected, actual)) throw new Error("SESSION_INVALID");
  if (mutation) {
    const expectedCsrf = Buffer.from(session.csrfHash, "hex");
    const actualCsrf = Buffer.from(hash(csrfToken ?? ""), "hex");
    if (expectedCsrf.length !== actualCsrf.length || !timingSafeEqual2(expectedCsrf, actualCsrf)) throw new Error("CSRF_INVALID");
  }
  return true;
}
function sessionCookie(token, { secure = true, maxAge = 604800 } = {}) {
  return `nexmarkets_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

// packages/domain/src/ids.mjs
import { randomUUID as randomUUID2 } from "node:crypto";
var PREFIX = /^[a-z][a-z0-9_]{1,23}$/;
function newDomainId(prefix) {
  if (!PREFIX.test(prefix)) throw new Error(`Invalid domain id prefix: ${prefix}`);
  return `${prefix}_${randomUUID2().replaceAll("-", "")}`;
}
var ids = Object.freeze({
  account: () => newDomainId("acct"),
  project: () => newDomainId("proj"),
  launch: () => newDomainId("launch"),
  terms: () => newDomainId("terms"),
  mintIntent: () => newDomainId("mint"),
  redemption: () => newDomainId("redeem"),
  chainTx: () => newDomainId("tx"),
  incident: () => newDomainId("incident")
});

// packages/domain/src/transaction-state.mjs
var TX_STATE = Object.freeze({
  PREPARED: "PREPARED",
  WALLET_PENDING: "WALLET_PENDING",
  SUBMITTED: "SUBMITTED",
  CONFIRMED: "CONFIRMED",
  FINALIZED: "FINALIZED",
  CANCELLED: "CANCELLED",
  REVERTED: "REVERTED",
  REORGED: "REORGED"
});
var NEXT = Object.freeze({
  PREPARED: /* @__PURE__ */ new Set(["WALLET_PENDING", "CANCELLED"]),
  WALLET_PENDING: /* @__PURE__ */ new Set(["SUBMITTED", "CANCELLED"]),
  SUBMITTED: /* @__PURE__ */ new Set(["CONFIRMED", "REVERTED", "REORGED"]),
  CONFIRMED: /* @__PURE__ */ new Set(["FINALIZED", "REORGED"]),
  REORGED: /* @__PURE__ */ new Set(["SUBMITTED", "REVERTED", "CANCELLED"]),
  FINALIZED: /* @__PURE__ */ new Set(),
  CANCELLED: /* @__PURE__ */ new Set(),
  REVERTED: /* @__PURE__ */ new Set()
});
function transitionTransaction(from, to) {
  if (!NEXT[from]?.has(to)) throw new Error(`Invalid transaction transition ${from} -> ${to}`);
  return to;
}

// packages/domain/src/authority.mjs
var CANONICAL_AUTHORITY = Object.freeze({
  passOwner: "ERC721",
  serial: "ERC721_TOKEN_ID",
  mintedSupply: "CHAIN",
  mintIntent: "NEX_MINT_CONTROLLER",
  primaryPayment: "CHAIN_USDG",
  termsVersion: "NEX_LAUNCH_REGISTRY",
  previewOpen: "NEX_LAUNCH_REGISTRY",
  projectContent: "POSTGRES",
  projectMedia: "OBJECT_STORAGE",
  artworkMapping: "EDITION_CONTENT_COMMITMENT",
  advantageRemaining: "NEX_ADVANTAGE_REGISTRY",
  seaportOrderStatus: "SEAPORT",
  listingPolicy: "NEX_LISTING_REGISTRY",
  secondaryTransfer: "ERC721_VIA_SEAPORT",
  royaltyLock: "NEX_ROYALTY_VAULT",
  referralAttribution: "POSTGRES_REFERRAL_LEDGER",
  tokenBoundAccount: "CANONICAL_ERC6551_REGISTRY_PLUS_ERC721_OWNER",
  indexer: "GOLDSKY_SUBGRAPH_READ_MODEL_MIRROR_ONLY",
  ui: "VIEW_ONLY"
});

// packages/domain/src/seaport-order.mjs
import { AbiCoder, Interface, concat, getAddress as getAddress2, isAddress, keccak256, toUtf8Bytes, verifyTypedData } from "ethers";
var SEAPORT_ITEM = Object.freeze({ ERC20: 1, ERC721: 2 });
var SECONDARY_PROTOCOL_FEE_BPS = 100n;
var BPS_DENOMINATOR = 10000n;
var LISTING_ZONE_DOMAIN = keccak256(toUtf8Bytes("NEXMARKETS_LISTING_ZONE_V1"));
var coder = AbiCoder.defaultAbiCoder();
var OFFER_ITEM_TYPEHASH = keccak256(toUtf8Bytes("OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)"));
var CONSIDERATION_ITEM_TYPEHASH = keccak256(toUtf8Bytes("ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)"));
var ORDER_COMPONENTS_TYPEHASH = keccak256(toUtf8Bytes("OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)"));
var listingInterface = new Interface(["function createListing((bytes32 orderHash,address edition,uint256 tokenId,bytes32 termsVersionHash,uint256 usdGPrice,uint64 startTime,uint64 expiry) request) returns (bytes32 zoneHash)"]);
var seaportInterface = new Interface(["function fulfillOrder(((address offerer,address zone,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offer,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 totalOriginalConsiderationItems) parameters,bytes signature) order,bytes32 fulfillerConduitKey) returns (bool fulfilled)"]);
var SEAPORT_TYPES = Object.freeze({
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" }
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" }
  ],
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" }
  ]
});
function address(value, label) {
  if (!isAddress(value)) throw new Error(`${label} must be an EVM address`);
  return getAddress2(value);
}
function uint(value, label) {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be an unsigned integer`);
  }
}
function secondaryAmounts(price, royaltyBps) {
  const P = uint(price, "price");
  const R = uint(royaltyBps, "royaltyBps");
  if (P === 0n) throw new Error("price must be positive");
  if (R > 500n) throw new Error("royaltyBps exceeds 5%");
  const protocolFee = P * SECONDARY_PROTOCOL_FEE_BPS / BPS_DENOMINATOR;
  if (protocolFee === 0n) throw new Error("price is too small for exact 1% fee");
  const royalty = P * R / BPS_DENOMINATOR;
  return { price: P, protocolFee, royalty, sellerProceeds: P - protocolFee - royalty };
}
function listingZoneHash(input) {
  return keccak256(coder.encode(
    ["bytes32", "address", "uint256", "address", "bytes32", "uint256", "address", "uint96", "uint64", "uint64"],
    [
      LISTING_ZONE_DOMAIN,
      address(input.edition, "edition"),
      uint(input.tokenId, "tokenId"),
      address(input.seller, "seller"),
      input.termsVersionHash,
      uint(input.price, "price"),
      address(input.royaltyReceiver, "royaltyReceiver"),
      uint(input.royaltyBps, "royaltyBps"),
      uint(input.startTime, "startTime"),
      uint(input.endTime, "endTime")
    ]
  ));
}
function itemHash(item, consideration) {
  const types = consideration ? ["bytes32", "uint8", "address", "uint256", "uint256", "uint256", "address"] : ["bytes32", "uint8", "address", "uint256", "uint256", "uint256"];
  const values = consideration ? [CONSIDERATION_ITEM_TYPEHASH, item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount, item.recipient] : [OFFER_ITEM_TYPEHASH, item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount];
  return keccak256(coder.encode(types, values));
}
function seaportOrderHash(order, counter) {
  const offerHash = keccak256(concat(order.offer.map((item) => itemHash(item, false))));
  const considerationHash = keccak256(concat(order.consideration.map((item) => itemHash(item, true))));
  return keccak256(coder.encode(
    ["bytes32", "address", "address", "bytes32", "bytes32", "uint8", "uint256", "uint256", "bytes32", "uint256", "bytes32", "uint256"],
    [
      ORDER_COMPONENTS_TYPEHASH,
      order.offerer,
      order.zone,
      offerHash,
      considerationHash,
      order.orderType,
      order.startTime,
      order.endTime,
      order.zoneHash,
      order.salt,
      order.conduitKey,
      uint(counter, "counter")
    ]
  ));
}
function seaportTypedData(order, counter, { chainId, seaport }) {
  return {
    domain: { name: "Seaport", version: "1.6", chainId: Number(chainId), verifyingContract: address(seaport, "seaport") },
    types: SEAPORT_TYPES,
    value: { ...order, counter: uint(counter, "counter") }
  };
}
function verifySeaportOrderSignature({ order, counter, signature, chainId, seaport }) {
  const typed = seaportTypedData(order, counter, { chainId, seaport });
  const signer = verifyTypedData(typed.domain, typed.types, typed.value, signature);
  if (getAddress2(signer) !== getAddress2(order.offerer)) throw new Error("Seaport signature does not match seller");
  return signer;
}
function buildSeaportFulfillment({ order, signature, seaport, fulfillerConduitKey = `0x${"00".repeat(32)}` }) {
  if (!/^0x[0-9a-fA-F]+$/.test(signature ?? "")) throw new Error("Seaport signature required");
  return {
    to: address(seaport, "seaport"),
    data: seaportInterface.encodeFunctionData("fulfillOrder", [[order, signature], fulfillerConduitKey]),
    value: "0x0"
  };
}
function buildNexMarketsOrder(input) {
  const seller = address(input.seller, "seller");
  const edition = address(input.edition, "edition");
  const usdg = address(input.usdg, "usdg");
  const protocolFeeRecipient = address(input.protocolFeeRecipient, "protocolFeeRecipient");
  const royaltyVault = address(input.royaltyVault, "royaltyVault");
  const zone = address(input.zone, "zone");
  const tokenId = uint(input.tokenId, "tokenId");
  if (tokenId === 0n) throw new Error("tokenId must be positive");
  const startTime = uint(input.startTime, "startTime");
  const endTime = uint(input.endTime, "endTime");
  if (endTime <= startTime) throw new Error("listing window is invalid");
  const computedZoneHash = input.termsVersionHash && input.royaltyReceiver ? listingZoneHash(input) : null;
  const zoneHash = input.zoneHash ?? computedZoneHash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(zoneHash ?? "")) throw new Error("zoneHash or complete listing Terms are required");
  if (computedZoneHash && computedZoneHash.toLowerCase() !== zoneHash.toLowerCase()) throw new Error("zoneHash does not match exact listing");
  const amounts = secondaryAmounts(input.price, input.royaltyBps);
  const consideration = [
    {
      itemType: SEAPORT_ITEM.ERC20,
      token: usdg,
      identifierOrCriteria: 0n,
      startAmount: amounts.protocolFee,
      endAmount: amounts.protocolFee,
      recipient: protocolFeeRecipient
    }
  ];
  if (amounts.royalty !== 0n) {
    consideration.push({
      itemType: SEAPORT_ITEM.ERC20,
      token: usdg,
      identifierOrCriteria: 0n,
      startAmount: amounts.royalty,
      endAmount: amounts.royalty,
      recipient: royaltyVault
    });
  }
  consideration.push({
    itemType: SEAPORT_ITEM.ERC20,
    token: usdg,
    identifierOrCriteria: 0n,
    startAmount: amounts.sellerProceeds,
    endAmount: amounts.sellerProceeds,
    recipient: seller
  });
  const order = {
    offerer: seller,
    zone,
    offer: [{
      itemType: SEAPORT_ITEM.ERC721,
      token: edition,
      identifierOrCriteria: tokenId,
      startAmount: 1n,
      endAmount: 1n
    }],
    consideration,
    orderType: 2,
    startTime,
    endTime,
    zoneHash: zoneHash.toLowerCase(),
    salt: uint(input.salt ?? keccak256(toUtf8Bytes(`${edition}:${tokenId}:${seller}:${startTime}`)), "salt"),
    conduitKey: input.conduitKey ?? `0x${"00".repeat(32)}`,
    totalOriginalConsiderationItems: BigInt(consideration.length)
  };
  validateNexMarketsOrder(order, { ...input, zoneHash, seller, edition, usdg, protocolFeeRecipient, royaltyVault, zone });
  const result = { order, amounts };
  if (input.counter !== void 0) result.orderHash = seaportOrderHash(order, input.counter);
  if (result.orderHash && input.listingRegistry && input.termsVersionHash) {
    result.registryTransaction = {
      to: address(input.listingRegistry, "listingRegistry"),
      data: listingInterface.encodeFunctionData("createListing", [[result.orderHash, edition, tokenId, input.termsVersionHash, amounts.price, startTime, endTime]])
    };
  }
  return result;
}
function validateNexMarketsOrder(order, policy) {
  const expected = secondaryAmounts(policy.price, policy.royaltyBps);
  const expectedLength = expected.royalty === 0n ? 2 : 3;
  if (order.offerer !== address(policy.seller, "seller") || order.zone !== address(policy.zone, "zone")) throw new Error("seller/zone mismatch");
  if (order.orderType !== 2 || order.zoneHash.toLowerCase() !== policy.zoneHash.toLowerCase()) throw new Error("restricted order/zoneHash mismatch");
  if (order.offer.length !== 1) throw new Error("order must offer exactly one item");
  const offered = order.offer[0];
  if (offered.itemType !== SEAPORT_ITEM.ERC721 || offered.token !== address(policy.edition, "edition") || offered.identifierOrCriteria !== BigInt(policy.tokenId) || offered.startAmount !== 1n || offered.endAmount !== 1n) throw new Error("exact Pass offer mismatch");
  if (order.consideration.length !== expectedLength) throw new Error("extra or missing consideration");
  const legs = expected.royalty === 0n ? [[address(policy.protocolFeeRecipient, "protocolFeeRecipient"), expected.protocolFee], [address(policy.seller, "seller"), expected.sellerProceeds]] : [[address(policy.protocolFeeRecipient, "protocolFeeRecipient"), expected.protocolFee], [address(policy.royaltyVault, "royaltyVault"), expected.royalty], [address(policy.seller, "seller"), expected.sellerProceeds]];
  let total = 0n;
  for (let i = 0; i < legs.length; i += 1) {
    const item = order.consideration[i];
    const [recipient, amount] = legs[i];
    if (item.itemType !== SEAPORT_ITEM.ERC20 || item.token !== address(policy.usdg, "usdg") || item.identifierOrCriteria !== 0n || item.startAmount !== amount || item.endAmount !== amount || item.recipient !== recipient) throw new Error(`consideration ${i} mismatch`);
    total += item.startAmount;
  }
  if (total !== expected.price) throw new Error("buyer surcharge or underpayment");
  if (order.endTime <= order.startTime) throw new Error("invalid listing window");
  if (policy.now !== void 0 && order.endTime <= BigInt(policy.now)) throw new Error("listing already expired");
  if (policy.currentOwner !== void 0 && address(policy.currentOwner, "currentOwner") !== address(policy.seller, "seller")) throw new Error("seller no longer owns Pass");
  return true;
}
function validateProjectedNexMarketsOrder(order, listing, policy) {
  if (getAddress2(order.offerer) !== getAddress2(listing.seller_address ?? listing.sellerAddress)) throw new Error("projected seller mismatch");
  if (getAddress2(order.zone) !== getAddress2(policy.zone) || order.orderType !== 2) throw new Error("projected zone mismatch");
  if (order.zoneHash.toLowerCase() !== String(listing.zone_hash ?? listing.zoneHash).toLowerCase()) throw new Error("projected zoneHash mismatch");
  if (order.offer.length !== 1) throw new Error("projected exact Pass offer mismatch");
  const offered = order.offer[0];
  if (Number(offered.itemType) !== SEAPORT_ITEM.ERC721 || getAddress2(offered.token) !== getAddress2(listing.edition_address ?? listing.editionAddress) || BigInt(offered.identifierOrCriteria) !== BigInt(listing.token_id ?? listing.tokenId) || BigInt(offered.startAmount) !== 1n || BigInt(offered.endAmount) !== 1n) throw new Error("projected exact Pass offer mismatch");
  const expectedRoyalty = BigInt(listing.royalty_usdg ?? listing.royaltyUsdg);
  const expectedLength = expectedRoyalty === 0n ? 2 : 3;
  if (order.consideration.length !== expectedLength) throw new Error("projected extra or missing consideration");
  const legs = expectedRoyalty === 0n ? [[policy.protocolFeeRecipient, listing.protocol_fee_usdg ?? listing.protocolFeeUsdg], [listing.seller_address ?? listing.sellerAddress, listing.seller_proceeds_usdg ?? listing.sellerProceedsUsdg]] : [[policy.protocolFeeRecipient, listing.protocol_fee_usdg ?? listing.protocolFeeUsdg], [policy.royaltyVault, expectedRoyalty], [listing.seller_address ?? listing.sellerAddress, listing.seller_proceeds_usdg ?? listing.sellerProceedsUsdg]];
  let total = 0n;
  for (let index = 0; index < legs.length; index += 1) {
    const item = order.consideration[index];
    const [recipient, expectedAmount] = legs[index];
    const amount = BigInt(expectedAmount);
    if (Number(item.itemType) !== SEAPORT_ITEM.ERC20 || getAddress2(item.token) !== getAddress2(policy.usdg) || getAddress2(item.recipient) !== getAddress2(recipient) || BigInt(item.identifierOrCriteria) !== 0n || BigInt(item.startAmount) !== amount || BigInt(item.endAmount) !== amount) throw new Error(`projected consideration ${index} mismatch`);
    total += amount;
  }
  if (total !== BigInt(listing.price_usdg ?? listing.priceUsdg)) throw new Error("projected buyer surcharge or underpayment");
  if (BigInt(order.startTime) !== BigInt(Math.floor(new Date(listing.starts_at ?? listing.startsAt).getTime() / 1e3)) || BigInt(order.endTime) !== BigInt(Math.floor(new Date(listing.expires_at ?? listing.expiresAt).getTime() / 1e3))) throw new Error("projected listing window mismatch");
  return true;
}

// packages/domain/src/referral-ledger.mjs
var REFERRAL_TIERS = Object.freeze([5, 10, 15, 20]);

// packages/domain/src/media-provenance.mjs
var MEDIA_POLICY = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  allowed: Object.freeze({
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/avif": ["avif"]
  })
});

// packages/domain/src/notification.mjs
var NOTIFICATION_TYPE = Object.freeze({
  PREVIEW_STARTED: "PREVIEW_STARTED",
  MINT_OPENED: "MINT_OPENED",
  MINT_FINALIZED: "MINT_FINALIZED",
  PASS_SOLD: "PASS_SOLD",
  LISTING_CANCELLED: "LISTING_CANCELLED",
  LISTING_EXPIRED: "LISTING_EXPIRED",
  LISTING_STALE: "LISTING_STALE",
  ADVANTAGE_USED: "ADVANTAGE_USED",
  ROYALTY_WITHDRAWABLE: "ROYALTY_WITHDRAWABLE",
  ROYALTY_WITHDRAWN: "ROYALTY_WITHDRAWN",
  REFERRAL_QUALIFIED: "REFERRAL_QUALIFIED",
  REFERRAL_SETTLED: "REFERRAL_SETTLED"
});

// packages/domain/src/transaction-calldata.mjs
import { Interface as Interface2, ZeroAddress, keccak256 as keccak2562, toUtf8Bytes as toUtf8Bytes2 } from "ethers";
var interfaces = {
  MINT: new Interface2(["function mint((address edition,bytes32 termsVersionHash,address recipient,uint256 quantity,bytes32 intentId,address referralHint,(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[] advantageConfigs) request) returns (uint256)"]),
  EDITION_CREATE: new Interface2(["function createEdition((string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI) config,address publisher,bytes32 salt) returns (address)"]),
  TERMS_PUBLISH: new Interface2(["function publishTerms(address edition,(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms) returns (bytes32)"]),
  LISTING_CANCEL: new Interface2(["function cancelListing(bytes32 orderHash)"]),
  ADVANTAGE_USE: new Interface2(["function consumeQuantity(address edition,uint256 tokenId,bytes32 advantageId,uint256 amount,bytes32 useId)", "function redeem(address edition,uint256 tokenId,bytes32 advantageId,bytes32 redemptionId)", "function useAmount(address edition,uint256 tokenId,bytes32 advantageId,bytes32 useId) returns (uint256)"]),
  ROYALTY_WITHDRAW: new Interface2(["function withdraw(bytes32 orderHash)"])
};
function buildProtocolCalldata(intentType, input, { walletAddress, idempotencyKey }) {
  const abi = interfaces[intentType];
  if (!abi) throw new Error("UNSUPPORTED_PROTOCOL_INTENT");
  if (intentType === "MINT") {
    const intentId = keccak2562(toUtf8Bytes2(`NEXMARKETS_MINT_INTENT:${walletAddress.toLowerCase()}:${idempotencyKey}`));
    return abi.encodeFunctionData("mint", [[input.edition, input.termsVersionHash, input.recipient ?? walletAddress, input.quantity, intentId, input.referralHint ?? ZeroAddress, input.advantageConfigs ?? []]]);
  }
  if (intentType === "EDITION_CREATE") return abi.encodeFunctionData("createEdition", [[input.name, input.symbol, input.initialOwner, input.editionId, input.absoluteSupplyCap, input.artworkCommitment, input.baseTokenURI], input.publisher, input.salt]);
  if (intentType === "TERMS_PUBLISH") return abi.encodeFunctionData("publishTerms", [input.edition, input.terms]);
  if (intentType === "LISTING_CANCEL") return abi.encodeFunctionData("cancelListing", [input.orderHash]);
  if (intentType === "ROYALTY_WITHDRAW") return abi.encodeFunctionData("withdraw", [input.orderHash]);
  if (intentType === "ADVANTAGE_USE" && input.operation === "REDEEM") return abi.encodeFunctionData("redeem", [input.edition, input.tokenId, input.advantageId, input.useId]);
  if (intentType === "ADVANTAGE_USE" && input.operation === "CONSUME_QUANTITY") return abi.encodeFunctionData("consumeQuantity", [input.edition, input.tokenId, input.advantageId, input.amount, input.useId]);
  if (intentType === "ADVANTAGE_USE" && input.operation === "USE_AMOUNT") return abi.encodeFunctionData("useAmount", [input.edition, input.tokenId, input.advantageId, input.useId]);
  throw new Error("ADVANTAGE_OPERATION_REQUIRED");
}

// packages/domain/src/launch-draft.mjs
var ALLOWED_CATEGORIES = Object.freeze([
  "tools",
  "ai",
  "media",
  "finance",
  "community",
  "gaming",
  "physical",
  "infrastructure"
]);
var ALLOWED_PRODUCT_STATES = Object.freeze([
  "Live",
  "MVP",
  "Beta",
  "Development",
  "Concept",
  "Preview"
]);
var ALLOWED_ADVANTAGE_MECHANISMS = Object.freeze([
  "TimeBased",
  "QuantityBased",
  "Connected",
  "Redemption"
]);
var ALLOWED_REFERRAL_RATES = Object.freeze([5, 10, 15, 20]);
var ALLOWED_PASS_DESIGNS = Object.freeze([
  "classic",
  "modern",
  "glass",
  "metal",
  "chroma"
]);
var ALLOWED_THEME_MODES = Object.freeze([
  "auto",
  "custom",
  "amber",
  "steel",
  "onyx"
]);
var ALLOWED_COLOR_STYLES = Object.freeze([
  "solid",
  "gradient"
]);
var ALLOWED_GRADIENT_DIRECTIONS = Object.freeze([
  "diagonal",
  "vertical",
  "horizontal",
  "radial"
]);
var ALLOWED_FRAMES = Object.freeze([
  "obsidian",
  "gilt",
  "prism",
  "carbon",
  "ivory",
  "verdigris",
  "lacquer",
  "denim",
  "sakura",
  "titanium",
  "cobalt",
  "onyx",
  "forge",
  "aurora"
]);
var ALLOWED_TEXTURES = Object.freeze([
  "none",
  "grain",
  "dots",
  "lines",
  "mesh",
  "grid",
  "carbon"
]);
var ALLOWED_ART_MODES = Object.freeze([
  "single",
  "collection"
]);
var HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
var SLUG_REGEX = /^[a-z0-9-]{3,80}$/;
var USDG_PRICE_REGEX = /^\d+(\.\d{1,6})?$/;
function isValidUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
function isValidVideoUrl(value) {
  if (!value || typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!isValidUrl(trimmed)) return false;
  return /(?:youtube\.com|youtu\.be|vimeo\.com|loom\.com)/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
}
function sanitizeMediaUrl(src, maxChars = 2048) {
  if (!src || typeof src !== "string") return "";
  const trimmed = src.trim();
  if (trimmed.startsWith("blob:")) return "";
  if (trimmed.startsWith("data:")) {
    return trimmed.length > maxChars ? "" : trimmed;
  }
  return trimmed.slice(0, maxChars);
}
function validateAndNormalizeProjectPayload(input = {}) {
  if (!input || typeof input !== "object") {
    throw Object.assign(new Error("INVALID_PROJECT"), { status: 400 });
  }
  const rawSlug = String(input.slug ?? input.launchDraft?.id?.replace(/^launch-/, "") ?? "").trim().toLowerCase();
  if (!SLUG_REGEX.test(rawSlug)) {
    throw Object.assign(new Error("INVALID_PROJECT_SLUG"), { status: 400 });
  }
  const rawName = String(input.name ?? input.launchDraft?.project?.name ?? "").trim();
  if (rawName.length < 2 || rawName.length > 120) {
    throw Object.assign(new Error("INVALID_PROJECT_NAME"), { status: 400 });
  }
  const summary = String(
    input.summary ?? input.launchDraft?.project?.desc ?? input.launchDraft?.project?.about ?? ""
  ).trim().slice(0, 500);
  const launchDraft = normalizeLaunchDraft(input.launchDraft ?? {}, {
    slug: rawSlug,
    name: rawName,
    summary,
    topSupply: input.supply,
    topPrice: input.price
  });
  return {
    slug: rawSlug,
    name: rawName,
    summary,
    launchDraft
  };
}
function normalizeLaunchDraft(draft = {}, defaults = {}) {
  const isFullDraft = draft && (draft.project || draft.edition || draft.advantages || draft.design || draft.preview);
  const name = String(draft.project?.name ?? defaults.name ?? "").trim();
  if (name.length < 2 || name.length > 120) {
    throw Object.assign(new Error("INVALID_PROJECT_NAME"), { status: 400 });
  }
  const slug = String(defaults.slug ?? draft.id?.replace(/^launch-/, "") ?? "").trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) {
    throw Object.assign(new Error("INVALID_PROJECT_SLUG"), { status: 400 });
  }
  const draftId = String(draft.draftId ?? defaults.draftId ?? `draft-${Date.now()}`).slice(0, 120);
  const projectInput = draft.project ?? {};
  const builder = String(projectInput.builder ?? name).trim();
  if (builder.length < 2 || builder.length > 120) {
    throw Object.assign(new Error("INVALID_BUILDER_NAME"), { status: 400 });
  }
  const builderHandle = String(projectInput.builderHandle ?? `@${slug}`).trim().slice(0, 80);
  const desc = String(projectInput.desc ?? defaults.summary ?? "").trim().slice(0, 500);
  const about = String(projectInput.about ?? defaults.summary ?? "").trim().slice(0, 4e3);
  if (isFullDraft && desc.length < 10) {
    throw Object.assign(new Error("INVALID_PROJECT_DESCRIPTION"), { status: 400 });
  }
  if (isFullDraft && about.length < 20) {
    throw Object.assign(new Error("INVALID_PROJECT_ABOUT"), { status: 400 });
  }
  const videoUrl = String(projectInput.videoUrl ?? "").trim();
  if (videoUrl && !isValidVideoUrl(videoUrl)) {
    throw Object.assign(new Error("INVALID_VIDEO_URL"), { status: 400 });
  }
  const evidence = projectInput.evidence ?? {};
  const evidenceType = String(evidence.type ?? projectInput.evidenceType ?? "Product").trim();
  const rawEvidenceUrl = String(evidence.url ?? projectInput.evidenceUrl ?? "").trim();
  if (isFullDraft && (!rawEvidenceUrl || !isValidUrl(rawEvidenceUrl))) {
    throw Object.assign(new Error("INVALID_EVIDENCE_URL"), { status: 400 });
  }
  const supportUrl = String(projectInput.supportUrl ?? "").trim();
  if (supportUrl && !isValidUrl(supportUrl)) {
    throw Object.assign(new Error("INVALID_SUPPORT_URL"), { status: 400 });
  }
  const category = String(projectInput.category ?? "tools").toLowerCase();
  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw Object.assign(new Error("INVALID_CATEGORY"), { status: 400 });
  }
  const productState = String(projectInput.productState ?? "Live");
  if (!ALLOWED_PRODUCT_STATES.includes(productState)) {
    throw Object.assign(new Error("INVALID_PRODUCT_STATE"), { status: 400 });
  }
  const bannerInput = projectInput.banner ?? {};
  const bannerPalette = Array.isArray(bannerInput.palette) && bannerInput.palette.length >= 3 ? bannerInput.palette.slice(0, 3).map((c) => HEX_COLOR_REGEX.test(c) ? c : "#5f6f50") : ["#5f6f50", "#30483d", "#111512"];
  const bannerLogoPosition = bannerInput.logoPosition === "tr" ? "tr" : "tl";
  const bannerSrc = sanitizeMediaUrl(bannerInput.src);
  const editionInput = draft.edition ?? {};
  const editionName = String(editionInput.name ?? "FOUNDING EDITION").trim().slice(0, 120);
  const series = String(editionInput.series ?? "SERIES 01").trim().slice(0, 80);
  const rawSupply = editionInput.supply ?? defaults.topSupply ?? 1;
  const supply = Number(rawSupply);
  if (!Number.isInteger(supply) || supply < 1) {
    throw Object.assign(new Error("INVALID_SUPPLY"), { status: 400 });
  }
  const rawPrice = editionInput.price ?? defaults.topPrice ?? 0;
  const priceString = String(rawPrice);
  if (!USDG_PRICE_REGEX.test(priceString) || Number(rawPrice) < 0) {
    throw Object.assign(new Error("INVALID_USDG_PRICE"), { status: 400 });
  }
  const price = Number(rawPrice);
  const rawRoyalty = editionInput.royalty ?? 0;
  const royalty = Number(rawRoyalty);
  if (Number.isNaN(royalty) || royalty < 0 || royalty > 5) {
    throw Object.assign(new Error("INVALID_ROYALTY"), { status: 400 });
  }
  const rawAdvantages = Array.isArray(draft.advantages) ? draft.advantages : [];
  const advantages = rawAdvantages.map((item, index) => {
    const mechKey = ALLOWED_ADVANTAGE_MECHANISMS.find(
      (m) => m.toLowerCase() === String(item.mechanism ?? "").toLowerCase()
    );
    if (!mechKey) {
      throw Object.assign(new Error("INVALID_ADVANTAGE_MECHANISM"), { status: 400 });
    }
    const covered = String(item.covered ?? "").trim().slice(0, 120);
    const benefit = String(item.benefit ?? "").trim().slice(0, 120);
    const duration = String(item.duration ?? "").trim().slice(0, 120);
    if (isFullDraft && (!covered || !benefit || !duration)) {
      throw Object.assign(new Error("INVALID_ADVANTAGE_DEFINITION"), { status: 400 });
    }
    return {
      id: String(item.id ?? `adv-${index + 1}`).slice(0, 64),
      mechanism: mechKey,
      covered,
      benefit,
      duration,
      summary: String(item.summary ?? `${benefit} \xB7 ${covered}`).trim().slice(0, 240)
    };
  });
  if (isFullDraft && advantages.length === 0) {
    throw Object.assign(new Error("ADVANTAGES_REQUIRED"), { status: 400 });
  }
  const refInput = draft.referral ?? {};
  const refEnabled = Boolean(refInput.enabled);
  const rawRefRate = Number(refInput.rate ?? 10);
  if (refEnabled && !ALLOWED_REFERRAL_RATES.includes(rawRefRate)) {
    throw Object.assign(new Error("INVALID_REFERRAL_RATE"), { status: 400 });
  }
  const referral = refEnabled ? { enabled: true, rate: rawRefRate, settlement: "Builder Settled" } : { enabled: false, rate: 0, settlement: "Builder Settled" };
  const maxPrimary = Number((supply * price).toFixed(6));
  const nexMarketsFee = Number((maxPrimary * 0.05).toFixed(6));
  const afterPlatformFee = Number((maxPrimary - nexMarketsFee).toFixed(6));
  const economics = {
    maxPrimary,
    nexMarketsFeeRate: 0.05,
    nexMarketsFee,
    afterPlatformFee
  };
  const designInput = draft.design ?? {};
  const passDesign = String(designInput.passDesign ?? "classic").toLowerCase();
  if (!ALLOWED_PASS_DESIGNS.includes(passDesign)) {
    throw Object.assign(new Error("INVALID_PASS_DESIGN"), { status: 400 });
  }
  const themeMode = String(designInput.themeMode ?? "auto").toLowerCase();
  if (!ALLOWED_THEME_MODES.includes(themeMode)) {
    throw Object.assign(new Error("INVALID_THEME_MODE"), { status: 400 });
  }
  const color = HEX_COLOR_REGEX.test(designInput.color) ? designInput.color : "#5f6f50";
  const colorStyle = ALLOWED_COLOR_STYLES.includes(designInput.colorStyle) ? designInput.colorStyle : "solid";
  const gradientA = HEX_COLOR_REGEX.test(designInput.gradientA) ? designInput.gradientA : color;
  const gradientB = HEX_COLOR_REGEX.test(designInput.gradientB) ? designInput.gradientB : "#17241f";
  const gradientDirection = ALLOWED_GRADIENT_DIRECTIONS.includes(designInput.gradientDirection) ? designInput.gradientDirection : "diagonal";
  const frame = ALLOWED_FRAMES.includes(designInput.frame) ? designInput.frame : "gilt";
  const frameColor = HEX_COLOR_REGEX.test(designInput.frameColor) ? designInput.frameColor : "#c8a84e";
  const texture = ALLOWED_TEXTURES.includes(designInput.texture) ? designInput.texture : "none";
  const textureTint = HEX_COLOR_REGEX.test(designInput.textureTint) ? designInput.textureTint : "#9b9b94";
  const artMode = ALLOWED_ART_MODES.includes(designInput.artMode) ? designInput.artMode : "single";
  const artX = Math.max(0, Math.min(100, Number(designInput.artX ?? 50)));
  const artY = Math.max(0, Math.min(100, Number(designInput.artY ?? 50)));
  const rawArtEdition = Array.isArray(designInput.artEdition) ? designInput.artEdition : [];
  const artEdition = rawArtEdition.map((entry, idx) => {
    const serial = entry.serial != null ? Number(entry.serial) : idx + 1;
    return {
      assetKey: String(entry.assetKey ?? entry.storageKey ?? "").slice(0, 160),
      filename: String(entry.filename ?? `artwork_${serial}`).slice(0, 160),
      title: String(entry.title ?? `Artwork ${serial}`).slice(0, 160),
      type: String(entry.type ?? entry.mimeType ?? "image/png").slice(0, 60),
      size: Number(entry.size ?? entry.byteSize ?? 0),
      sha256: typeof entry.sha256 === "string" && /^[0-9a-f]{64}$/i.test(entry.sha256) ? entry.sha256.toLowerCase() : null,
      serial,
      traits: entry.traits && typeof entry.traits === "object" ? { ...entry.traits } : {}
    };
  });
  if (artMode === "collection" && artEdition.length > 0 && artEdition.length !== supply) {
    throw Object.assign(new Error("COLLECTION_ARTWORK_SUPPLY_MISMATCH"), { status: 400 });
  }
  const design = {
    passDesign,
    themeMode,
    color,
    colorStyle,
    gradientA,
    gradientB,
    gradientDirection,
    frame,
    frameColor,
    texture,
    textureTint,
    logoSrc: sanitizeMediaUrl(designInput.logoSrc),
    artMode,
    artSrc: sanitizeMediaUrl(designInput.artSrc),
    artEdition,
    selectedSerialIndex: Math.max(0, Number(designInput.selectedSerialIndex ?? 0)),
    artX,
    artY
  };
  const previewInput = draft.preview ?? {};
  const rawHours = Number(previewInput.hours ?? 24);
  if (!Number.isInteger(rawHours) || rawHours < 24) {
    throw Object.assign(new Error("INVALID_PREVIEW_HOURS"), { status: 400 });
  }
  const rawOpensAt = previewInput.opensAt ?? new Date(Date.now() + rawHours * 3600 * 1e3).toISOString();
  const openDate = new Date(rawOpensAt);
  if (Number.isNaN(openDate.getTime())) {
    throw Object.assign(new Error("INVALID_OPENING_TIME"), { status: 400 });
  }
  const timezone = String(previewInput.timezone ?? "UTC").trim().slice(0, 80);
  const termsVersion = String(previewInput.termsVersion ?? "v1.0").trim().slice(0, 32);
  const preview = {
    hours: rawHours,
    opensAt: openDate.toISOString(),
    localOpensAt: String(previewInput.localOpensAt ?? rawOpensAt),
    timezone,
    termsVersion
  };
  const reviewInput = draft.review ?? {};
  const review = {
    evidence: Boolean(reviewInput.evidence ?? draft.reviewEvidence),
    advantages: Boolean(reviewInput.advantages ?? draft.reviewAdvantages),
    preview: Boolean(reviewInput.preview ?? draft.reviewPreview)
  };
  const network = "robinhood";
  return {
    id: `launch-${slug}`,
    draftId,
    network,
    project: {
      name,
      builder,
      builderHandle,
      desc,
      about,
      videoUrl,
      category,
      productState,
      evidence: {
        type: evidenceType,
        url: rawEvidenceUrl,
        label: String(evidence.label ?? evidenceType)
      },
      supportUrl,
      banner: {
        src: bannerSrc,
        palette: bannerPalette,
        logoPosition: bannerLogoPosition
      },
      network
    },
    edition: {
      name: editionName,
      series,
      supply,
      price,
      royalty,
      network
    },
    advantages,
    referral,
    economics,
    design,
    preview,
    review,
    status: "DRAFT"
  };
}

// packages/observability/src/metrics.mjs
var VALID = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
var MetricsRegistry = class {
  constructor() {
    this.values = /* @__PURE__ */ new Map();
  }
  increment(name, amount = 1) {
    if (!VALID.test(name)) throw new Error("invalid metric");
    this.values.set(name, (this.values.get(name) ?? 0) + amount);
  }
  set(name, value) {
    if (!VALID.test(name) || !Number.isFinite(value)) throw new Error("invalid metric");
    this.values.set(name, value);
  }
  get(name) {
    return this.values.get(name) ?? 0;
  }
  render() {
    return `${[...this.values.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name} ${value}`).join("\n")}
`;
  }
};
var REQUIRED_METRICS = Object.freeze([
  "nexmarkets_api_requests_total",
  "nexmarkets_api_failures_total",
  "nexmarkets_transactions_failed_total",
  "nexmarkets_indexer_latest_block",
  "nexmarkets_indexer_lag_blocks",
  "nexmarkets_reconciliation_errors_total",
  "nexmarkets_reconciliation_lag_seconds",
  "nexmarkets_outbox_retries_total",
  "nexmarkets_db_ready"
]);

// apps/api/src/server.mjs
var JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
var INTENT_TYPE = Object.freeze({
  "/v1/mints/prepare": "MINT",
  "/v1/editions/prepare": "EDITION_CREATE",
  "/v1/terms/prepare": "TERMS_PUBLISH",
  "/v1/listings/prepare": "LISTING_CREATE",
  "/v1/listings/cancel": "LISTING_CANCEL",
  "/v1/advantages/consume": "ADVANTAGE_USE",
  "/v1/royalties/withdraw": "ROYALTY_WITHDRAW"
});
var INTENT_SELECTORS = Object.freeze({
  MINT: [id("mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))").slice(0, 10)],
  EDITION_CREATE: [id("createEdition((string,string,address,bytes32,uint32,bytes32,string),address,bytes32)").slice(0, 10)],
  TERMS_PUBLISH: [id("publishTerms(address,(uint256,uint256,uint64,uint64,uint64,address,address,uint96,bytes32,bytes32))").slice(0, 10)],
  LISTING_CANCEL: [id("cancelListing(bytes32)").slice(0, 10)],
  ADVANTAGE_USE: [id("consumeQuantity(address,uint256,bytes32,uint256,bytes32)").slice(0, 10), id("redeem(address,uint256,bytes32,bytes32)").slice(0, 10), id("useAmount(address,uint256,bytes32,bytes32)").slice(0, 10)],
  ROYALTY_WITHDRAW: [id("withdraw(bytes32)").slice(0, 10)]
});
var ADVANTAGES_DOMAIN = keccak2563(toUtf8Bytes3("NEXMARKETS_ADVANTAGES_V1"));
var ADVANTAGE_TUPLE = "tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[]";
var SAFE_EVIDENCE_ABI = new Interface3([
  "event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)",
  "event ExecutionFailure(bytes32 indexed txHash,uint256 payment)"
]);
var FACTORY_EVIDENCE_ABI = new Interface3([
  "event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address protocolAdmin,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)"
]);
var FACTORY_CONFIG_TUPLE = "tuple(string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI)";
var PINNED_CREATION_BYTECODE = "0x60e06040526001600c55348015610014575f5ffd5b50604051612c38380380612c3883398101604081905261003391610337565b6040810151815160208301515f61004a83826104af565b50600161005782826104af565b5050506001600160a01b03811661008757604051631e4fbdf760e01b81525f600482015260240160405180910390fd5b610090816101f3565b5060017f9b779b17422d0df92223018b32b4d1fa46e071723d6817e2486d003becc55f005560408101516001600160a01b03166100e057604051631c9670bb60e01b815260040160405180910390fd5b606081015161010257604051630609d2f760e01b815260040160405180910390fd5b60a08101516101245760405163fe8b4fc560e01b815260040160405180910390fd5b806080015163ffffffff165f0361014e576040516315ae672760e01b815260040160405180910390fd5b8060c00151515f036101735760405163180caec360e21b815260040160405180910390fd5b6060810151608090815260a080830151905281015163ffffffff1660c0908152810151600a906101a390826104af565b5060a08101516060820151608083015160405163ffffffff90911681527f3a34ed2682da72a47ed7c5d17d81cde3e653636dd09c3f4009a8f0294b3628e59060200160405180910390a350610569565b600880546001600160a01b038381166001600160a01b0319831681179093556040519116919082907f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0905f90a35050565b634e487b7160e01b5f52604160045260245ffd5b60405160e081016001600160401b038111828210171561027a5761027a610244565b60405290565b5f82601f83011261028f575f5ffd5b81516001600160401b038111156102a8576102a8610244565b604051601f8201601f19908116603f011681016001600160401b03811182821017156102d6576102d6610244565b6040528181528382016020018510156102ed575f5ffd5b8160208501602083015e5f918101602001919091529392505050565b80516001600160a01b038116811461031f575f5ffd5b919050565b805163ffffffff8116811461031f575f5ffd5b5f60208284031215610347575f5ffd5b81516001600160401b0381111561035c575f5ffd5b820160e0818503121561036d575f5ffd5b610375610258565b81516001600160401b0381111561038a575f5ffd5b61039686828501610280565b82525060208201516001600160401b038111156103b1575f5ffd5b6103bd86828501610280565b6020830152506103cf60408301610309565b6040820152606082810151908201526103ea60808301610324565b608082015260a0828101519082015260c08201516001600160401b03811115610411575f5ffd5b61041d86828501610280565b60c083015250949350505050565b600181811c9082168061043f57607f821691505b60208210810361045d57634e487b7160e01b5f52602260045260245ffd5b50919050565b601f8211156104aa57805f5260205f20601f840160051c810160208510156104885750805b601f840160051c820191505b818110156104a7575f8155600101610494565b50505b505050565b81516001600160401b038111156104c8576104c8610244565b6104dc816104d6845461042b565b84610463565b6020601f82116001811461050e575f83156104f75750848201515b5f19600385901b1c1916600184901b1784556104a7565b5f84815260208120601f198516915b8281101561053d578785015182556020948501946001909201910161051d565b508482101561055a57868401515f19600387901b60f8161c191681555b50505050600190811b01905550565b60805160a05160c0516126826105b65f395f818161029401528181610820015281816108ea0152818161091c01528181611379015261147d01525f61041801525f6104b901526126825ff3fe";
function editionCreationCode() {
  try {
    const pinned = readFileSync(new URL("../../../packages/contracts/bytecode/NexPassEdition.creation.hex", import.meta.url), "utf8").trim();
    if (pinned.startsWith("0x")) return pinned;
  } catch {
  }
  try {
    const artifact = JSON.parse(readFileSync(new URL("../../../packages/contracts/out/NexPassEdition.sol/NexPassEdition.json", import.meta.url), "utf8"));
    const bytecode = typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode?.object;
    if (bytecode && bytecode !== "0x") return bytecode;
  } catch {
  }
  return PINNED_CREATION_BYTECODE;
}
function predictEditionAddress({ factoryAddress, name, symbol, initialOwner, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI, salt }) {
  if (!isAddress2(factoryAddress) || !isAddress2(initialOwner)) throw Object.assign(new Error("FACTORY_CONFIGURATION_REQUIRED"), { status: 503 });
  const encodedConfig = AbiCoder2.defaultAbiCoder().encode([FACTORY_CONFIG_TUPLE], [[name, symbol, factoryAddress, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI]]);
  return getCreate2Address(getAddress3(factoryAddress), salt, keccak2563(concat2([editionCreationCode(), encodedConfig]))).toLowerCase();
}
function canonicalAdvantagesHash(configs) {
  if (!Array.isArray(configs) || configs.length === 0) return "0x" + "00".repeat(32);
  try {
    const coder2 = AbiCoder2.defaultAbiCoder();
    return keccak2563(coder2.encode(["bytes32", ADVANTAGE_TUPLE], [ADVANTAGES_DOMAIN, configs.map((config) => [config.advantageId, config.kind, config.startsAt, config.endsAt, config.totalUnits, config.definitionHash])]));
  } catch {
    return null;
  }
}
async function verifySafeExecutionEvidence({ chain, request, txHash, safeTransactionHash, orderPolicy }) {
  if (!chain?.getTransactionReceipt || !chain?.getTransactionByHash) throw Object.assign(new Error("SAFE_CHAIN_EVIDENCE_UNAVAILABLE"), { status: 503 });
  const receipt = await chain.getTransactionReceipt(txHash);
  const tx = await chain.getTransactionByHash(txHash);
  if (!receipt || receipt.status === "0x0" || receipt.status === 0 || receipt.status === false) throw Object.assign(new Error("SAFE_EXECUTION_NOT_SUCCESSFUL"), { status: 409 });
  if (!tx?.to || !orderPolicy.protocolAdminSafe || tx.to.toLowerCase() !== orderPolicy.protocolAdminSafe.toLowerCase()) throw Object.assign(new Error("SAFE_EXECUTION_TARGET_MISMATCH"), { status: 400 });
  const expectedEditionId = String(request.edition_id_hash ?? request.editionIdHash ?? request.request_payload?.editionId ?? request.requestPayload?.editionId ?? "").toLowerCase();
  const factory = orderPolicy.transactionTargets?.EDITION_CREATE?.toLowerCase();
  let execution = false;
  let executionHash = null;
  let editionEvent = null;
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() === orderPolicy.protocolAdminSafe.toLowerCase()) {
      try {
        const parsed = SAFE_EVIDENCE_ABI.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "ExecutionFailure") throw Object.assign(new Error("SAFE_EXECUTION_FAILED"), { status: 409 });
        if (parsed?.name === "ExecutionSuccess") {
          execution = true;
          executionHash = parsed.args.txHash.toLowerCase();
        }
      } catch (error) {
        if (error.status) throw error;
      }
    }
    if (factory && log.address?.toLowerCase() === factory) {
      try {
        const parsed = FACTORY_EVIDENCE_ABI.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "EditionCreated") editionEvent = parsed.args;
      } catch {
      }
    }
  }
  if (!execution || safeTransactionHash && executionHash !== safeTransactionHash.toLowerCase()) throw Object.assign(new Error("SAFE_EXECUTION_EVENT_REQUIRED"), { status: 409 });
  if (!editionEvent || String(editionEvent.editionId).toLowerCase() !== expectedEditionId) throw Object.assign(new Error("EDITION_CREATED_EVIDENCE_REQUIRED"), { status: 409 });
  const payload = request.request_payload ?? request.requestPayload ?? {};
  const predictedEdition = request.predicted_edition_address ?? request.predictedEditionAddress ?? payload.predictedEditionAddress ?? payload.predicted_edition_address;
  if (!predictedEdition || editionEvent.edition.toLowerCase() !== predictedEdition.toLowerCase()) throw Object.assign(new Error("SAFE_EDITION_ADDRESS_MISMATCH"), { status: 409 });
  if (editionEvent.protocolAdmin.toLowerCase() !== orderPolicy.protocolAdminSafe.toLowerCase()) throw Object.assign(new Error("SAFE_PROTOCOL_ADMIN_MISMATCH"), { status: 409 });
  const expectedController = orderPolicy.transactionTargets?.MINT;
  if (!expectedController || editionEvent.mintController.toLowerCase() !== expectedController.toLowerCase()) throw Object.assign(new Error("SAFE_MINT_CONTROLLER_MISMATCH"), { status: 409 });
  if (payload.publisher && editionEvent.publisher.toLowerCase() !== payload.publisher.toLowerCase()) throw Object.assign(new Error("SAFE_CALLDATA_PUBLISHER_MISMATCH"), { status: 409 });
  if (payload.absoluteSupplyCap != null && String(editionEvent.absoluteSupplyCap) !== String(payload.absoluteSupplyCap)) throw Object.assign(new Error("SAFE_CALLDATA_SUPPLY_MISMATCH"), { status: 409 });
  if (payload.artworkCommitment && editionEvent.artworkCommitment.toLowerCase() !== payload.artworkCommitment.toLowerCase()) throw Object.assign(new Error("SAFE_CALLDATA_ARTWORK_MISMATCH"), { status: 409 });
  if (payload.salt && editionEvent.salt.toLowerCase() !== payload.salt.toLowerCase()) throw Object.assign(new Error("SAFE_CALLDATA_SALT_MISMATCH"), { status: 409 });
  return { txHash: txHash.toLowerCase(), safeTransactionHash: safeTransactionHash?.toLowerCase() ?? null, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, edition: editionEvent.edition.toLowerCase(), editionId: editionEvent.editionId.toLowerCase(), verified: true };
}
function productionOrderPolicy(env = process.env) {
  return {
    usdg: env.USDG_ADDRESS ?? "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    protocolFeeRecipient: env.SECONDARY_FEE_RECIPIENT,
    royaltyVault: env.NEX_ROYALTY_VAULT_ADDRESS,
    zone: env.NEX_MARKETS_ZONE_ADDRESS,
    listingRegistry: env.NEX_LISTING_REGISTRY_ADDRESS,
    seaport: env.SEAPORT_16_ADDRESS ?? "0x0000000000000068F116a894984e2DB1123eB395",
    protocolAdminSafe: env.PROTOCOL_ADMIN_SAFE_ADDRESS,
    transactionTargets: {
      MINT: env.NEX_MINT_CONTROLLER_ADDRESS,
      EDITION_CREATE: env.NEX_PASS_FACTORY_ADDRESS,
      TERMS_PUBLISH: env.NEX_LAUNCH_REGISTRY_ADDRESS,
      LISTING_CANCEL: env.NEX_LISTING_REGISTRY_ADDRESS,
      ADVANTAGE_USE: env.NEX_ADVANTAGE_REGISTRY_ADDRESS,
      ROYALTY_WITHDRAW: env.NEX_ROYALTY_VAULT_ADDRESS
    }
  };
}
function json(res, status, payload, headers = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(JSON.stringify(payload, (_, value) => typeof value === "bigint" ? value.toString() : value));
}
async function readBody(req, maxBytes = 1048576) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { status: 400 });
  }
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie ?? "").split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, index).trim()), decodeURIComponent(part.slice(index + 1))];
  }));
}
var RateLimiter = class {
  constructor({ limit = 120, windowMs = 6e4 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.buckets = /* @__PURE__ */ new Map();
  }
  take(key, now = Date.now()) {
    const prior = this.buckets.get(key);
    const bucket = !prior || prior.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : prior;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (bucket.count > this.limit) throw Object.assign(new Error("RATE_LIMITED"), { status: 429 });
  }
};
function securityHeaders(requestId) {
  return {
    "x-request-id": requestId,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "strict-transport-security": "max-age=31536000; includeSubDomains"
  };
}
function createApiServer({
  store,
  chainId = 4663,
  allowedOrigin = process.env.APP_ORIGIN ?? "https://nexmarkets.fun",
  secureCookies = process.env.NODE_ENV !== "test",
  rateLimiter = new RateLimiter(),
  logger = { info() {
  }, error() {
  } },
  orderPolicy = {},
  metrics = new MetricsRegistry(),
  requireIndexedReadiness = false,
  chain = null,
  subgraph = null,
  maxIndexerLagBlocks = 120,
  maxFinalityLagBlocks = 120,
  storage = { async prepareUpload({ key }) {
    return { method: "PUT", key, expiresInSeconds: 900 };
  } }
} = {}) {
  if (!store) throw new Error("store required");
  return http.createServer(async (req, res) => {
    const requestId = req.headers["x-request-id"]?.toString().slice(0, 128) || randomUUID3();
    const correlationId = req.headers["x-correlation-id"]?.toString().slice(0, 128) || requestId;
    const startedAt = Date.now();
    for (const [key, value] of Object.entries(securityHeaders(requestId))) res.setHeader(key, value);
    try {
      metrics.increment("nexmarkets_api_requests_total");
      rateLimiter.take(req.socket.remoteAddress ?? "unknown");
      const url = new URL(req.url, allowedOrigin);
      const origin = req.headers.origin;
      if (origin && new URL(origin).origin !== new URL(allowedOrigin).origin) {
        const reqHost = req.headers["x-forwarded-host"] || req.headers.host;
        if (!reqHost || new URL(origin).host !== reqHost) throw Object.assign(new Error("ORIGIN_REJECTED"), { status: 403 });
      }
      if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { status: "ok", service: "api", version: "v1", requestId });
      if (req.method === "GET" && url.pathname === "/readyz") {
        await store.ready();
        metrics.set("nexmarkets_db_ready", 1);
        const subgraphStatus = requireIndexedReadiness && subgraph?.enabled ? await subgraph.indexingStatus() : null;
        const indexer = requireIndexedReadiness && !subgraphStatus ? await store.indexerHealth(chainId) : null;
        if (requireIndexedReadiness && !indexer && !subgraphStatus) throw Object.assign(new Error("INDEXER_NOT_READY"), { status: 503 });
        if (requireIndexedReadiness && !chain?.getBlockNumber) throw Object.assign(new Error("CHAIN_HEAD_UNAVAILABLE"), { status: 503 });
        let chainHead = null;
        let indexedLag = null;
        let finalityLag = null;
        if ((indexer || subgraphStatus) && chain?.getBlockNumber) {
          chainHead = await chain.getBlockNumber();
          const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0);
          const finalized = subgraphStatus ? landed : Number(indexer.finalized_watermark_block_number ?? indexer.finalized_block_number ?? 0);
          indexedLag = chainHead - landed;
          finalityLag = chainHead - finalized;
          if (indexedLag > maxIndexerLagBlocks || finalityLag > maxFinalityLagBlocks) {
            logger.info?.({ event: "indexer_stale", chainHead, landedBlock: landed, finalizedBlock: finalized, indexedLag, finalityLag, maxIndexerLagBlocks, maxFinalityLagBlocks });
            throw Object.assign(new Error("INDEXER_STALE"), { status: 503 });
          }
        }
        if (indexer || subgraphStatus) {
          const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0);
          metrics.set("nexmarkets_indexer_latest_block", landed);
          metrics.set("nexmarkets_indexer_lag_blocks", indexedLag ?? 0);
        }
        return json(res, 200, { status: "ready", database: "ok", indexer: indexer || subgraphStatus ? "fresh" : "not-required", indexerProvider: subgraphStatus ? "GOLDSKY_SUBGRAPH" : indexer ? "GOLDSKY_TURBO_DEPRECATED" : null, chainHead, landedBlock: subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : indexer ? Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0) : null, latestEventBlock: indexer ? Number(indexer.latest_event_block_number ?? indexer.latest_block_number ?? 0) : null, indexedLag, finalityLag, requestId });
      }
      if (req.method === "GET" && url.pathname === "/metrics") {
        res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
        return res.end(metrics.render());
      }
      if (req.method === "GET" && url.pathname === "/v1/discover") return json(res, 200, { data: subgraph?.enabled ? await subgraph.discover() : await store.discover(), authority: subgraph?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL" : "POSTGRES_READ_MODEL" });
      if (req.method === "GET" && url.pathname === "/v1/market/listings") return json(res, 200, { data: subgraph?.enabled ? await subgraph.listings() : await store.listings(), authority: subgraph?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL" : "NEX_LISTING_REGISTRY_PROJECTION" });
      if (req.method === "GET" && url.pathname.startsWith("/v1/projects/")) return json(res, 200, { data: await store.projectBySlug(decodeURIComponent(url.pathname.slice(13))) });
      if (req.method === "GET" && url.pathname.startsWith("/v1/editions/")) return json(res, 200, { data: subgraph?.enabled ? await subgraph.editionByAddress(url.pathname.slice(13)) : await store.editionByAddress(url.pathname.slice(13)), authority: subgraph?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL" : "CHAIN_PROJECTION" });
      if (req.method === "GET" && url.pathname.startsWith("/v1/passes/")) {
        const [, , , edition, tokenId] = url.pathname.split("/");
        return json(res, 200, { data: subgraph?.enabled ? await subgraph.pass(edition, tokenId) : await store.pass(edition, tokenId), authority: subgraph?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_RPC_VERIFICATION" : "CHAIN_PROJECTION" });
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/challenge") {
        const input = await readBody(req);
        const challenge = issueWalletChallenge({ accountId: `pending:${input.address?.toLowerCase()}`, address: input.address, origin: allowedOrigin, chainId });
        await store.saveChallenge(challenge);
        return json(res, 201, { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt, chainId });
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/verify") {
        const input = await readBody(req);
        const challenge = await store.challenge(input.nonce);
        if (!challenge) throw Object.assign(new Error("CHALLENGE_NOT_FOUND"), { status: 404 });
        assertChallengeUsable(challenge, { accountId: challenge.accountId, address: challenge.address, origin: allowedOrigin, chainId });
        verifyWalletChallengeSignature(challenge, input.signature);
        const issued = issueSession({ accountId: "pending", walletId: "pending" });
        const identity = await store.consumeChallengeAndCreateSession({ challenge, session: issued.record, signature: input.signature });
        return json(res, 200, { accountId: identity.accountId, wallet: challenge.address, csrfToken: issued.csrfToken }, { "set-cookie": sessionCookie(issued.token, { secure: secureCookies }) });
      }
      const token = cookies(req).nexmarkets_session;
      const session = token ? await store.sessionByToken(token) : null;
      if (!session) throw Object.assign(new Error("AUTH_REQUIRED"), { status: 401 });
      assertSession(session, token, { csrfToken: req.headers["x-csrf-token"], mutation: req.method !== "GET" });
      if (req.method === "POST" && url.pathname === "/v1/auth/logout") {
        await store.revokeSession(session.id);
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "SESSION_REVOKED", objectType: "SESSION", objectId: session.id, requestId, correlationId });
        return json(res, 200, { status: "revoked" }, { "set-cookie": "nexmarkets_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
      }
      if (req.method === "GET" && url.pathname === "/v1/me/passes") return json(res, 200, { data: await store.ownedPasses(session.walletAddress), authority: "CHAIN_PROJECTION" });
      if (req.method === "GET" && url.pathname === "/v1/me/advantages") return json(res, 200, { data: await store.advantagesForOwner(session.walletAddress), authority: "NEX_ADVANTAGE_REGISTRY_PROJECTION" });
      if (req.method === "GET" && url.pathname === "/v1/builder/dashboard") return json(res, 200, { data: await store.builderDashboard(session.accountId), authority: "MIXED_PROJECTION" });
      if (req.method === "GET" && url.pathname.startsWith("/v1/transactions/")) {
        const tx = await store.transaction(url.pathname.slice(17), session.accountId);
        if (!tx) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        return json(res, 200, { data: tx });
      }
      if (req.method === "GET" && url.pathname.startsWith("/v1/edition-requests/")) {
        const request = await store.editionRequestById(url.pathname.slice(21), session.accountId);
        if (!request) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        return json(res, 200, { data: request, authority: "SAFE_WORKFLOW_REQUEST" });
      }
      if (req.method === "POST" && /^\/v1\/edition-requests\/[^/]+\/safe-submit$/.test(url.pathname)) {
        const requestId2 = url.pathname.split("/")[3];
        const request = await store.editionRequestById(requestId2, session.accountId);
        if (!request) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        const input = await readBody(req);
        if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(input.safeTransactionHash ?? "")) throw Object.assign(new Error("SAFE_TX_HASH_REQUIRED"), { status: 400 });
        const evidence = await verifySafeExecutionEvidence({ chain, request, txHash: input.txHash.toLowerCase(), safeTransactionHash: input.safeTransactionHash.toLowerCase(), orderPolicy });
        const submitted = await store.submitEditionRequest({ id: requestId2, safeTransactionHash: input.safeTransactionHash.toLowerCase(), txHash: input.txHash.toLowerCase(), evidence });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "EDITION_SAFE_SUBMITTED", objectType: "EDITION_REQUEST", objectId: submitted.id, requestId: requestId2, correlationId, metadata: { txHash: submitted.txHash, safeTransactionHash: submitted.safeTransactionHash, evidence } });
        return json(res, 200, { data: submitted, authority: "PROTOCOL_ADMIN_SAFE_EVIDENCE" });
      }
      if (req.method === "POST" && /^\/v1\/transactions\/[^/]+\/events$/.test(url.pathname)) {
        const id2 = url.pathname.split("/")[3];
        const input = await readBody(req);
        const transaction = await store.transaction(id2, session.accountId);
        if (!transaction) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        if (!["WALLET_PENDING", "SUBMITTED", "CANCELLED"].includes(input.state)) throw Object.assign(new Error("USER_TRANSACTION_STATE_REJECTED"), { status: 400 });
        if (transaction.state !== input.state) transitionTransaction(transaction.state, input.state);
        if (input.state === "SUBMITTED" && !/^0x[0-9a-fA-F]{64}$/.test(input.txHash ?? "")) throw Object.assign(new Error("TX_HASH_REQUIRED"), { status: 400 });
        const eventId = String(input.eventId ?? "").slice(0, 160);
        if (!eventId) throw Object.assign(new Error("EVENT_ID_REQUIRED"), { status: 400 });
        const updated = await store.updateTransaction({ id: id2, accountId: session.accountId, eventId, fromState: transaction.state, toState: input.state, evidence: { txHash: input.txHash?.toLowerCase() } });
        return json(res, 200, { data: updated });
      }
      if (req.method === "POST" && url.pathname === "/v1/builder/projects") {
        const input = await readBody(req);
        const normalized = validateAndNormalizeProjectPayload(input);
        const project = await store.createProject({
          accountId: session.accountId,
          body: {
            slug: normalized.slug,
            name: normalized.name,
            summary: normalized.summary,
            launchDraft: normalized.launchDraft
          }
        });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "PROJECT_DRAFT_CREATED", objectType: "PROJECT", objectId: project.id, requestId, correlationId });
        return json(res, 201, { data: project });
      }
      if (req.method === "POST" && url.pathname === "/v1/media/uploads") {
        const input = await readBody(req);
        if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > 25 * 1024 * 1024 || !/^image\/(jpeg|png|webp|avif)$/.test(input.mimeType ?? "") || !/^[0-9a-f]{64}$/.test(input.sha256 ?? "")) throw Object.assign(new Error("INVALID_MEDIA"), { status: 400 });
        const extension = String(input.filename ?? "").split(".").pop()?.toLowerCase();
        const extensions = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/avif": ["avif"] };
        if (!extensions[input.mimeType]?.includes(extension)) throw Object.assign(new Error("MIME_EXTENSION_MISMATCH"), { status: 400 });
        const key = `${session.accountId}/${randomUUID3()}/${String(input.filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const row = await store.createMedia({ accountId: session.accountId, metadata: { storageKey: key, filename: input.filename, mimeType: input.mimeType, byteSize: input.byteSize, sha256: input.sha256, safetyStatus: "PENDING" } });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "MEDIA_UPLOAD_PREPARED", objectType: "MEDIA", objectId: row.id, requestId, correlationId, metadata: { mimeType: input.mimeType, byteSize: input.byteSize } });
        return json(res, 201, { data: row, upload: await storage.prepareUpload({ key, mimeType: input.mimeType, byteSize: input.byteSize }) });
      }
      if (req.method === "POST" && url.pathname === "/v1/listings/signed-order") {
        const input = await readBody(req);
        const listing = await store.listing(input.orderHash ?? "");
        if (String(input.order?.offerer ?? "").toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error("SELLER_SESSION_MISMATCH"), { status: 403 });
        const computedHash = seaportOrderHash(input.order, input.counter);
        if (computedHash.toLowerCase() !== String(input.orderHash).toLowerCase()) throw Object.assign(new Error("ORDER_HASH_MISMATCH"), { status: 400 });
        if (listing) validateProjectedNexMarketsOrder(input.order, listing, orderPolicy);
        else if (String(input.order.zone).toLowerCase() !== String(orderPolicy.zone).toLowerCase()) throw Object.assign(new Error("ZONE_MISMATCH"), { status: 400 });
        verifySeaportOrderSignature({ order: input.order, counter: input.counter, signature: input.signature, chainId: session.chainId, seaport: orderPolicy.seaport });
        const stored = await store.storeSignedOrder({ accountId: session.accountId, chainId: session.chainId, orderHash: computedHash, seller: session.walletAddress, order: input.order, counter: input.counter, signature: input.signature });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "SEAPORT_ORDER_STORED", objectType: "LISTING", objectId: computedHash, requestId, correlationId });
        return json(res, 201, { data: stored, authority: "SIGNED_ORDER_CAPABILITY_ONLY" });
      }
      if (req.method === "POST" && url.pathname === "/v1/listings/buy") {
        const input = await readBody(req);
        const idempotencyKey = req.headers["idempotency-key"]?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error("IDEMPOTENCY_KEY_REQUIRED"), { status: 400 });
        const signed = await store.signedOrder(input.orderHash ?? "");
        if (!signed || signed.status !== "ACTIVE" || new Date(signed.expires_at ?? signed.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error("ACTIVE_SIGNED_LISTING_REQUIRED"), { status: 409 });
        const order = signed.order_payload ?? signed.order;
        const listing = await store.listing(input.orderHash);
        validateProjectedNexMarketsOrder(order, listing, orderPolicy);
        verifySeaportOrderSignature({ order, counter: signed.counter, signature: signed.signature, chainId: session.chainId, seaport: orderPolicy.seaport });
        const prepared = buildSeaportFulfillment({ order, signature: signed.signature, seaport: orderPolicy.seaport });
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: "LISTING_BUY", intentId: input.orderHash, idempotencyKey, correlationId, requestId, toAddress: prepared.to, calldata: prepared.data });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "TRANSACTION_PREPARED", objectType: "CHAIN_TRANSACTION", objectId: transaction.id, requestId, correlationId, metadata: { intentType: "LISTING_BUY", orderHash: input.orderHash } });
        return json(res, 201, { transaction, prepared, totalBuyerPayment: String(listing.price_usdg ?? listing.priceUsdg), walletMustSign: true, serverCustodiesKey: false });
      }
      if (req.method === "POST" && INTENT_TYPE[url.pathname]) {
        const input = await readBody(req);
        const idempotencyKey = req.headers["idempotency-key"]?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error("IDEMPOTENCY_KEY_REQUIRED"), { status: 400 });
        let prepared = { calldata: input.calldata ?? null, payload: input };
        let workflowPayload = input;
        if (url.pathname === "/v1/listings/prepare") {
          if (String(input.seller).toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error("SELLER_SESSION_MISMATCH"), { status: 403 });
          prepared = buildNexMarketsOrder({ ...input, ...orderPolicy });
          if (prepared.orderHash) prepared.typedData = seaportTypedData(prepared.order, input.counter, { chainId: session.chainId, seaport: orderPolicy.seaport });
        } else {
          const intentType = INTENT_TYPE[url.pathname];
          const target = orderPolicy.transactionTargets?.[intentType];
          if (!isAddress2(target ?? "")) throw Object.assign(new Error("CONTRACT_CONFIGURATION_REQUIRED"), { status: 503 });
          if (input.to !== void 0 && (!isAddress2(input.to) || getAddress3(input.to) !== getAddress3(target))) throw Object.assign(new Error("TRANSACTION_TARGET_REJECTED"), { status: 400 });
          let calldata = input.calldata;
          let protocolInput = input;
          if (intentType === "EDITION_CREATE") {
            if (!input.projectId) throw Object.assign(new Error("PROJECT_ID_REQUIRED"), { status: 400 });
            if (!isAddress2(orderPolicy.protocolAdminSafe ?? "")) throw Object.assign(new Error("PROTOCOL_ADMIN_SAFE_CONFIGURATION_REQUIRED"), { status: 503 });
            if (input.initialOwner !== void 0 && getAddress3(input.initialOwner) !== getAddress3(orderPolicy.protocolAdminSafe)) throw Object.assign(new Error("PROTOCOL_ADMIN_SAFE_REQUIRED"), { status: 400 });
            protocolInput = { ...input, initialOwner: orderPolicy.protocolAdminSafe, protocolAdmin: orderPolicy.protocolAdminSafe, mintController: orderPolicy.transactionTargets?.MINT ?? null };
            const predictedEditionAddress = predictEditionAddress({ factoryAddress: target, ...protocolInput });
            protocolInput = { ...protocolInput, predictedEditionAddress };
            workflowPayload = protocolInput;
            calldata = void 0;
          }
          if (intentType === "TERMS_PUBLISH") {
            if (!isAddress2(input.edition ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(input.terms?.advantagesHash ?? "")) throw Object.assign(new Error("TERMS_COMMITMENT_REQUIRED"), { status: 400 });
            const computedAdvantagesHash = canonicalAdvantagesHash(input.advantageConfigs ?? []);
            if (!computedAdvantagesHash || computedAdvantagesHash.toLowerCase() !== input.terms.advantagesHash.toLowerCase()) throw Object.assign(new Error("ADVANTAGES_COMMITMENT_MISMATCH"), { status: 400 });
            await store.saveTermsCommitment?.({ builderAccountId: session.accountId, editionAddress: input.edition, advantagesHash: input.terms.advantagesHash, termsPayload: input.terms, configs: input.advantageConfigs ?? [] });
            calldata = void 0;
          }
          if (calldata === void 0) calldata = buildProtocolCalldata(intentType, protocolInput, { walletAddress: session.walletAddress, idempotencyKey });
          if (!/^0x[0-9a-fA-F]+$/.test(calldata ?? "") || !INTENT_SELECTORS[intentType]?.includes(calldata.slice(0, 10).toLowerCase())) throw Object.assign(new Error("CALLDATA_SELECTOR_REJECTED"), { status: 400 });
          prepared = { to: getAddress3(target), data: calldata, value: "0x0", ...intentType === "EDITION_CREATE" ? { predictedEditionAddress: protocolInput.predictedEditionAddress } : {} };
        }
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: INTENT_TYPE[url.pathname], intentId: input.intentId ?? idempotencyKey, idempotencyKey, correlationId, requestId, toAddress: prepared.to ?? prepared.registryTransaction?.to ?? null, calldata: prepared.data ?? prepared.registryTransaction?.data ?? null });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "TRANSACTION_PREPARED", objectType: "CHAIN_TRANSACTION", objectId: transaction.id, requestId, correlationId, metadata: { intentType: INTENT_TYPE[url.pathname] } });
        if (INTENT_TYPE[url.pathname] === "EDITION_CREATE") {
          const request = await store.createEditionRequest({ projectId: input.projectId, builderAccountId: session.accountId, chainId: session.chainId, payload: workflowPayload, transactionId: transaction.id });
          const safePending = await store.markEditionRequestSafePending?.(request.id, session.accountId) ?? request;
          return json(res, 201, { transaction, request: safePending, safeProposal: prepared, safeRequired: true, walletMustSign: false, serverCustodiesKey: false });
        }
        return json(res, 201, { transaction, prepared, walletMustSign: true, serverCustodiesKey: false });
      }
      return json(res, 404, { error: { code: "NOT_FOUND", requestId } });
    } catch (error) {
      metrics.increment("nexmarkets_api_failures_total");
      const clientFailure = /(?:INVALID|MISMATCH|REJECTED|REQUIRED|CONFLICT|expired|consumed|challenge|signature|wrong|extra|surcharge|price|tokenId|listing|seller|zoneHash|royaltyBps|CALLDATA|TARGET|PROJECT_BUILDER)/i.test(error.message);
      const status = error.status ?? (/AUTH|SESSION/.test(error.message) ? 401 : /CSRF|ORIGIN/.test(error.message) ? 403 : clientFailure ? 400 : 500);
      const code = status >= 500 ? "INTERNAL_ERROR" : error.message;
      logger.error?.({ event: "api_request_failed", requestId, correlationId, method: req.method, path: req.url?.split("?")[0], code, error: error.message, durationMs: Date.now() - startedAt });
      return json(res, status, { error: { code, requestId } });
    } finally {
      logger.info?.({ event: "api_request_complete", requestId, correlationId, method: req.method, path: req.url?.split("?")[0], durationMs: Date.now() - startedAt });
    }
  });
}
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const store = new PostgresStore();
  const port = Number(process.env.PORT || 4010);
  const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663);
  const rpc = new JsonRpcClient(chainId === 46630 ? process.env.RH_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com" : process.env.RH_MAINNET_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com");
  const subgraph = new SubgraphClient({ endpoint: process.env.NEXMARKETS_SUBGRAPH_URL, certificationEditionAddress: process.env.CERTIFICATION_EDITION_ADDRESS, certificationEditionName: process.env.CERTIFICATION_EDITION_NAME });
  const secureCookies = process.env.SECURE_COOKIES === "true" ? true : process.env.SECURE_COOKIES === "false" ? false : process.env.NODE_ENV !== "test";
  const requireIndexedReadiness = process.env.REQUIRE_INDEXED_READINESS === "true" || process.env.NODE_ENV === "production";
  const logger = process.env.LOG_API_ERRORS === "true" ? console : { info() {
  }, error() {
  } };
  const server = createApiServer({ store, chainId, chain: rpc, subgraph, secureCookies, logger, maxIndexerLagBlocks: Number(process.env.INDEXER_MAX_LAG_BLOCKS ?? 120), maxFinalityLagBlocks: Number(process.env.INDEXER_MAX_FINALITY_LAG_BLOCKS ?? 120), orderPolicy: productionOrderPolicy(), requireIndexedReadiness });
  server.listen(port, () => console.log(JSON.stringify({ event: "api_started", port })));
  const shutdown = async () => {
    server.close();
    await store.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// api/src/_server.js
init_memory_store();
var requestListener = null;
async function getApiListener() {
  if (requestListener) return requestListener;
  const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 46630);
  const rpcUrl = chainId === 46630 ? process.env.RH_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com" : process.env.RH_MAINNET_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
  const rpc = new JsonRpcClient(rpcUrl);
  const subgraph = new SubgraphClient({
    endpoint: process.env.NEXMARKETS_SUBGRAPH_URL ?? "https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn",
    certificationEditionAddress: process.env.CERTIFICATION_EDITION_ADDRESS ?? "0x4171D62F43B4168b07a01C04594455DBc3298437",
    certificationEditionName: process.env.CERTIFICATION_EDITION_NAME ?? "NexMarkets V1 Test Certification Edition"
  });
  let store = null;
  if (process.env.DATABASE_URL) {
    try {
      store = new PostgresStore(process.env.DATABASE_URL);
    } catch {
      store = new MemoryStore();
    }
  } else {
    store = new MemoryStore();
  }
  const orderPolicy = productionOrderPolicy(process.env);
  const rateLimiter = new RateLimiter({ limit: 300, windowMs: 6e4 });
  const server = createApiServer({
    store,
    chainId,
    chain: rpc,
    subgraph,
    allowedOrigin: process.env.APP_ORIGIN ?? "https://nexmarkets.fun",
    secureCookies: process.env.NODE_ENV === "production",
    orderPolicy,
    rateLimiter,
    requireIndexedReadiness: false
  });
  requestListener = server.listeners("request")[0];
  return requestListener;
}

// api/src/v1/[...slug].js
async function handler(req, res) {
  try {
    const listener = await getApiListener();
    if (req.url.startsWith("/api/v1/")) {
      req.url = req.url.replace("/api/v1/", "/v1/");
    } else if (req.url === "/api/v1") {
      req.url = "/v1/discover";
    }
    return await listener(req, res);
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "V1_ROUTING_ERROR", message: err.message, stack: err.stack }));
  }
}
export {
  handler as default
};
