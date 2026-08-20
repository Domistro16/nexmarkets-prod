import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getAddress, id, isAddress } from 'ethers';
import { issueSession, issueWalletChallenge, assertChallengeUsable, assertSession, sessionCookie, verifyWalletChallengeSignature } from '../../../packages/auth/src/index.mjs';
import { buildNexMarketsOrder, transitionTransaction } from '../../../packages/domain/src/index.mjs';
import { PostgresStore } from '../../../packages/data/src/postgres-store.mjs';
import { MetricsRegistry } from '../../../packages/observability/src/metrics.mjs';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const INTENT_TYPE = Object.freeze({
  '/v1/mints/prepare': 'MINT', '/v1/editions/prepare': 'EDITION_CREATE', '/v1/terms/prepare': 'TERMS_PUBLISH', '/v1/listings/prepare': 'LISTING_CREATE',
  '/v1/listings/cancel': 'LISTING_CANCEL', '/v1/advantages/consume': 'ADVANTAGE_USE',
  '/v1/royalties/withdraw': 'ROYALTY_WITHDRAW'
});
const INTENT_SELECTORS = Object.freeze({
  MINT: [id('mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))').slice(0, 10)],
  EDITION_CREATE: [id('createEdition((string,string,address,bytes32,uint32,bytes32,string),address,bytes32)').slice(0, 10)],
  TERMS_PUBLISH: [id('publishTerms(address,(uint256,uint256,uint64,uint64,uint64,address,address,uint96,bytes32,bytes32))').slice(0, 10)],
  LISTING_CANCEL: [id('cancelListing(bytes32)').slice(0, 10)],
  ADVANTAGE_USE: [id('consumeQuantity(address,uint256,bytes32,uint256,bytes32)').slice(0, 10), id('redeem(address,uint256,bytes32,bytes32)').slice(0, 10)],
  ROYALTY_WITHDRAW: [id('withdraw(bytes32)').slice(0, 10)]
});

export function productionOrderPolicy(env = process.env) {
  return {
    usdg: env.USDG_ADDRESS ?? '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    protocolFeeRecipient: env.SECONDARY_FEE_RECIPIENT,
    royaltyVault: env.NEX_ROYALTY_VAULT_ADDRESS,
    zone: env.NEX_MARKETS_ZONE_ADDRESS,
    listingRegistry: env.NEX_LISTING_REGISTRY_ADDRESS,
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
  res.end(JSON.stringify(payload, (_, value) => typeof value === 'bigint' ? value.toString() : value));
}

async function readBody(req, maxBytes = 1_048_576) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}

function cookies(req) {
  return Object.fromEntries((req.headers.cookie ?? '').split(';').filter(Boolean).map((part) => {
    const index = part.indexOf('='); return [decodeURIComponent(part.slice(0, index).trim()), decodeURIComponent(part.slice(index + 1))];
  }));
}

export class RateLimiter {
  constructor({ limit = 120, windowMs = 60_000 } = {}) { this.limit = limit; this.windowMs = windowMs; this.buckets = new Map(); }
  take(key, now = Date.now()) {
    const prior = this.buckets.get(key);
    const bucket = !prior || prior.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : prior;
    bucket.count += 1; this.buckets.set(key, bucket);
    if (bucket.count > this.limit) throw Object.assign(new Error('RATE_LIMITED'), { status: 429 });
  }
}

function securityHeaders(requestId) {
  return {
    'x-request-id': requestId, 'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'strict-transport-security': 'max-age=31536000; includeSubDomains'
  };
}

export function createApiServer({
  store,
  chainId = 4663,
  allowedOrigin = process.env.APP_ORIGIN ?? 'https://nexmarkets.fun',
  secureCookies = process.env.NODE_ENV !== 'test',
  rateLimiter = new RateLimiter(),
  logger = { info() {}, error() {} },
  orderPolicy = {},
  metrics = new MetricsRegistry(),
  requireIndexedReadiness = false,
  storage = { async prepareUpload({ key }) { return { method: 'PUT', key, expiresInSeconds: 900 }; } }
} = {}) {
  if (!store) throw new Error('store required');
  return http.createServer(async (req, res) => {
    const requestId = req.headers['x-request-id']?.toString().slice(0, 128) || randomUUID();
    const correlationId = req.headers['x-correlation-id']?.toString().slice(0, 128) || requestId;
    const startedAt = Date.now();
    for (const [key, value] of Object.entries(securityHeaders(requestId))) res.setHeader(key, value);
    try {
      metrics.increment('nexmarkets_api_requests_total');
      rateLimiter.take(req.socket.remoteAddress ?? 'unknown');
      const url = new URL(req.url, allowedOrigin);
      const origin = req.headers.origin;
      if (origin && new URL(origin).origin !== new URL(allowedOrigin).origin) throw Object.assign(new Error('ORIGIN_REJECTED'), { status: 403 });

      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'ok', service: 'api', version: 'v1', requestId });
      if (req.method === 'GET' && url.pathname === '/readyz') {
        await store.ready(); metrics.set('nexmarkets_db_ready', 1);
        const indexer = requireIndexedReadiness ? await store.indexerHealth(chainId) : null;
        if (requireIndexedReadiness && !indexer) throw Object.assign(new Error('INDEXER_NOT_READY'), { status: 503 });
        if (indexer) { metrics.set('nexmarkets_indexer_latest_block', Number(indexer.latest_block_number)); metrics.set('nexmarkets_indexer_lag_blocks', Number(indexer.latest_block_number) - Number(indexer.finalized_block_number)); }
        return json(res, 200, { status: 'ready', database: 'ok', indexer: indexer ? 'checkpoint-present' : 'not-required', requestId });
      }
      if (req.method === 'GET' && url.pathname === '/metrics') { res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); return res.end(metrics.render()); }
      if (req.method === 'GET' && url.pathname === '/v1/discover') return json(res, 200, { data: await store.discover(), authority: 'POSTGRES_READ_MODEL' });
      if (req.method === 'GET' && url.pathname === '/v1/market/listings') return json(res, 200, { data: await store.listings(), authority: 'NEX_LISTING_REGISTRY_PROJECTION' });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/projects/')) return json(res, 200, { data: await store.projectBySlug(decodeURIComponent(url.pathname.slice(13))) });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/editions/')) return json(res, 200, { data: await store.editionByAddress(url.pathname.slice(13)) });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/passes/')) { const [, , , edition, tokenId] = url.pathname.split('/'); return json(res, 200, { data: await store.pass(edition, tokenId), authority: 'CHAIN_PROJECTION' }); }

      if (req.method === 'POST' && url.pathname === '/v1/auth/challenge') {
        const input = await readBody(req);
        const challenge = issueWalletChallenge({ accountId: `pending:${input.address?.toLowerCase()}`, address: input.address, origin: allowedOrigin, chainId });
        await store.saveChallenge(challenge);
        return json(res, 201, { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt, chainId });
      }
      if (req.method === 'POST' && url.pathname === '/v1/auth/verify') {
        const input = await readBody(req); const challenge = await store.challenge(input.nonce);
        if (!challenge) throw Object.assign(new Error('CHALLENGE_NOT_FOUND'), { status: 404 });
        assertChallengeUsable(challenge, { accountId: challenge.accountId, address: challenge.address, origin: allowedOrigin, chainId });
        verifyWalletChallengeSignature(challenge, input.signature);
        const issued = issueSession({ accountId: 'pending', walletId: 'pending' });
        const identity = await store.consumeChallengeAndCreateSession({ challenge, session: issued.record, signature: input.signature });
        return json(res, 200, { accountId: identity.accountId, wallet: challenge.address, csrfToken: issued.csrfToken }, { 'set-cookie': sessionCookie(issued.token, { secure: secureCookies }) });
      }

      const token = cookies(req).nexmarkets_session;
      const session = token ? await store.sessionByToken(token) : null;
      if (!session) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
      assertSession(session, token, { csrfToken: req.headers['x-csrf-token'], mutation: req.method !== 'GET' });

      if (req.method === 'POST' && url.pathname === '/v1/auth/logout') { await store.revokeSession(session.id); await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'SESSION_REVOKED', objectType: 'SESSION', objectId: session.id, requestId, correlationId }); return json(res, 200, { status: 'revoked' }, { 'set-cookie': 'nexmarkets_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' }); }
      if (req.method === 'GET' && url.pathname === '/v1/me/passes') return json(res, 200, { data: await store.ownedPasses(session.walletAddress), authority: 'CHAIN_PROJECTION' });
      if (req.method === 'GET' && url.pathname === '/v1/me/advantages') return json(res, 200, { data: await store.advantagesForOwner(session.walletAddress), authority: 'NEX_ADVANTAGE_REGISTRY_PROJECTION' });
      if (req.method === 'GET' && url.pathname === '/v1/builder/dashboard') return json(res, 200, { data: await store.builderDashboard(session.accountId), authority: 'MIXED_PROJECTION' });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/transactions/')) { const tx = await store.transaction(url.pathname.slice(17), session.accountId); if (!tx) throw Object.assign(new Error('NOT_FOUND'), { status: 404 }); return json(res, 200, { data: tx }); }
      if (req.method === 'POST' && /^\/v1\/transactions\/[^/]+\/events$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3]; const input = await readBody(req);
        const transaction = await store.transaction(id, session.accountId);
        if (!transaction) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
        if (!['WALLET_PENDING', 'SUBMITTED', 'CANCELLED'].includes(input.state)) throw Object.assign(new Error('USER_TRANSACTION_STATE_REJECTED'), { status: 400 });
        if (transaction.state !== input.state) transitionTransaction(transaction.state, input.state);
        if (input.state === 'SUBMITTED' && !/^0x[0-9a-fA-F]{64}$/.test(input.txHash ?? '')) throw Object.assign(new Error('TX_HASH_REQUIRED'), { status: 400 });
        const eventId = String(input.eventId ?? '').slice(0, 160);
        if (!eventId) throw Object.assign(new Error('EVENT_ID_REQUIRED'), { status: 400 });
        const updated = await store.updateTransaction({ id, accountId: session.accountId, eventId, fromState: transaction.state, toState: input.state, evidence: { txHash: input.txHash?.toLowerCase() } });
        return json(res, 200, { data: updated });
      }
      if (req.method === 'POST' && url.pathname === '/v1/builder/projects') {
        const input = await readBody(req);
        if (!/^[a-z0-9-]{3,80}$/.test(input.slug ?? '') || typeof input.name !== 'string') throw Object.assign(new Error('INVALID_PROJECT'), { status: 400 });
        if (input.supply !== undefined && (!Number.isInteger(Number(input.supply)) || Number(input.supply) < 1)) throw Object.assign(new Error('INVALID_SUPPLY'), { status: 400 });
        if (input.price !== undefined && !/^\d+(\.\d{1,6})?$/.test(String(input.price))) throw Object.assign(new Error('INVALID_USDG_PRICE'), { status: 400 });
        const project = await store.createProject({ accountId: session.accountId, body: {
          slug: input.slug, name: input.name.slice(0, 120), summary: String(input.summary ?? '').slice(0, 500),
          launchDraft: { supply: input.supply === undefined ? null : Number(input.supply), priceUsdg: input.price ?? null }
        } });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'PROJECT_DRAFT_CREATED', objectType: 'PROJECT', objectId: project.id, requestId, correlationId });
        return json(res, 201, { data: project });
      }
      if (req.method === 'POST' && url.pathname === '/v1/media/uploads') {
        const input = await readBody(req);
        if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > 25 * 1024 * 1024 || !/^image\/(jpeg|png|webp|avif)$/.test(input.mimeType ?? '') || !/^[0-9a-f]{64}$/.test(input.sha256 ?? '')) throw Object.assign(new Error('INVALID_MEDIA'), { status: 400 });
        const extension = String(input.filename ?? '').split('.').pop()?.toLowerCase();
        const extensions = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/avif': ['avif'] };
        if (!extensions[input.mimeType]?.includes(extension)) throw Object.assign(new Error('MIME_EXTENSION_MISMATCH'), { status: 400 });
        const key = `${session.accountId}/${randomUUID()}/${String(input.filename).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const row = await store.createMedia({ accountId: session.accountId, metadata: { storageKey: key, filename: input.filename, mimeType: input.mimeType, byteSize: input.byteSize, sha256: input.sha256, safetyStatus: 'PENDING' } });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'MEDIA_UPLOAD_PREPARED', objectType: 'MEDIA', objectId: row.id, requestId, correlationId, metadata: { mimeType: input.mimeType, byteSize: input.byteSize } });
        return json(res, 201, { data: row, upload: await storage.prepareUpload({ key, mimeType: input.mimeType, byteSize: input.byteSize }) });
      }

      if (req.method === 'POST' && INTENT_TYPE[url.pathname]) {
        const input = await readBody(req); const idempotencyKey = req.headers['idempotency-key']?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'), { status: 400 });
        let prepared = { calldata: input.calldata ?? null, payload: input };
        if (url.pathname === '/v1/listings/prepare') {
          if (String(input.seller).toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error('SELLER_SESSION_MISMATCH'), { status: 403 });
          // Deployment policy wins over untrusted request fields.
          prepared = buildNexMarketsOrder({ ...input, ...orderPolicy });
        } else {
          const intentType = INTENT_TYPE[url.pathname]; const target = orderPolicy.transactionTargets?.[intentType];
          if (!isAddress(target ?? '')) throw Object.assign(new Error('CONTRACT_CONFIGURATION_REQUIRED'), { status: 503 });
          if (!isAddress(input.to ?? '') || getAddress(input.to) !== getAddress(target)) throw Object.assign(new Error('TRANSACTION_TARGET_REJECTED'), { status: 400 });
          if (!/^0x[0-9a-fA-F]+$/.test(input.calldata ?? '') || !INTENT_SELECTORS[intentType]?.includes(input.calldata.slice(0, 10).toLowerCase())) throw Object.assign(new Error('CALLDATA_SELECTOR_REJECTED'), { status: 400 });
          prepared = { to: getAddress(target), data: input.calldata, value: '0x0' };
        }
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: INTENT_TYPE[url.pathname], intentId: input.intentId ?? idempotencyKey, idempotencyKey, correlationId, requestId });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'TRANSACTION_PREPARED', objectType: 'CHAIN_TRANSACTION', objectId: transaction.id, requestId, correlationId, metadata: { intentType: INTENT_TYPE[url.pathname] } });
        return json(res, 201, { transaction, prepared, walletMustSign: true, serverCustodiesKey: false });
      }
      return json(res, 404, { error: { code: 'NOT_FOUND', requestId } });
    } catch (error) {
      metrics.increment('nexmarkets_api_failures_total');
      const clientFailure = /(?:INVALID|MISMATCH|REJECTED|REQUIRED|CONFLICT|expired|consumed|challenge|signature|wrong|extra|surcharge|price|tokenId|listing|seller|zoneHash|royaltyBps|CALLDATA|TARGET)/i.test(error.message);
      const status = error.status ?? (/AUTH|SESSION/.test(error.message) ? 401 : /CSRF|ORIGIN/.test(error.message) ? 403 : clientFailure ? 400 : 500);
      const code = status >= 500 ? 'INTERNAL_ERROR' : error.message;
      logger.error?.({ event: 'api_request_failed', requestId, correlationId, method: req.method, path: req.url?.split('?')[0], code, durationMs: Date.now() - startedAt });
      return json(res, status, { error: { code, requestId } });
    } finally {
      logger.info?.({ event: 'api_request_complete', requestId, correlationId, method: req.method, path: req.url?.split('?')[0], durationMs: Date.now() - startedAt });
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const store = new PostgresStore(); const port = Number(process.env.PORT || 4010);
  const server = createApiServer({ store, chainId: Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663), orderPolicy: productionOrderPolicy(), requireIndexedReadiness: process.env.NODE_ENV === 'production' });
  server.listen(port, () => console.log(JSON.stringify({ event: 'api_started', port })));
  const shutdown = async () => { server.close(); await store.close(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
