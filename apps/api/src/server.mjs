import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { AbiCoder, concat, getAddress, getCreate2Address, id, Interface, isAddress, keccak256, toUtf8Bytes } from 'ethers';
import { issueSession, issueWalletChallenge, assertChallengeUsable, assertSession, sessionCookie, verifyWalletChallengeSignature } from '../../../packages/auth/src/index.mjs';
import { buildNexMarketsOrder, buildProtocolCalldata, buildSeaportFulfillment, seaportOrderHash, seaportTypedData, transitionTransaction, validateProjectedNexMarketsOrder, verifySeaportOrderSignature } from '../../../packages/domain/src/index.mjs';
import { PostgresStore } from '../../../packages/data/src/postgres-store.mjs';
import { MetricsRegistry } from '../../../packages/observability/src/metrics.mjs';
import { JsonRpcClient } from '../../../packages/chain/src/rpc.mjs';
import { SubgraphClient } from '../../../packages/subgraph-client/src/index.mjs';

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
  ADVANTAGE_USE: [id('consumeQuantity(address,uint256,bytes32,uint256,bytes32)').slice(0, 10), id('redeem(address,uint256,bytes32,bytes32)').slice(0, 10), id('useAmount(address,uint256,bytes32,bytes32)').slice(0, 10)],
  ROYALTY_WITHDRAW: [id('withdraw(bytes32)').slice(0, 10)]
});
const ADVANTAGES_DOMAIN = keccak256(toUtf8Bytes('NEXMARKETS_ADVANTAGES_V1'));
const ADVANTAGE_TUPLE = 'tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[]';
const SAFE_EVIDENCE_ABI = new Interface([
  'event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)',
  'event ExecutionFailure(bytes32 indexed txHash,uint256 payment)'
]);
const FACTORY_EVIDENCE_ABI = new Interface([
  'event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address protocolAdmin,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)'
]);
const FACTORY_CONFIG_TUPLE = 'tuple(string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI)';
function editionCreationCode() {
  try {
    const pinned = readFileSync(new URL('../../../packages/contracts/bytecode/NexPassEdition.creation.hex', import.meta.url), 'utf8').trim();
    if (pinned.startsWith('0x')) return pinned;
  } catch { /* local source checkouts may rely on the generated artifact */ }
  try {
    const artifact = JSON.parse(readFileSync(new URL('../../../packages/contracts/out/NexPassEdition.sol/NexPassEdition.json', import.meta.url), 'utf8'));
    const bytecode = typeof artifact.bytecode === 'string' ? artifact.bytecode : artifact.bytecode?.object;
    if (!bytecode || bytecode === '0x') throw new Error('empty bytecode');
    return bytecode;
  } catch (error) { throw Object.assign(new Error(`FACTORY_BYTECODE_REQUIRED:${error.message}`), { status: 503 }); }
}
export function predictEditionAddress({ factoryAddress, name, symbol, initialOwner, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI, salt }) {
  if (!isAddress(factoryAddress) || !isAddress(initialOwner)) throw Object.assign(new Error('FACTORY_CONFIGURATION_REQUIRED'), { status: 503 });
  const encodedConfig = AbiCoder.defaultAbiCoder().encode([FACTORY_CONFIG_TUPLE], [[name, symbol, factoryAddress, editionId, absoluteSupplyCap, artworkCommitment, baseTokenURI]]);
  return getCreate2Address(getAddress(factoryAddress), salt, keccak256(concat([editionCreationCode(), encodedConfig]))).toLowerCase();
}
function canonicalAdvantagesHash(configs) {
  if (!Array.isArray(configs) || configs.length === 0) return '0x' + '00'.repeat(32);
  try {
    const coder = AbiCoder.defaultAbiCoder();
    return keccak256(coder.encode(['bytes32', ADVANTAGE_TUPLE], [ADVANTAGES_DOMAIN, configs.map((config) => [config.advantageId, config.kind, config.startsAt, config.endsAt, config.totalUnits, config.definitionHash])]));
  } catch { return null; }
}

async function verifySafeExecutionEvidence({ chain, request, txHash, safeTransactionHash, orderPolicy }) {
  if (!chain?.getTransactionReceipt || !chain?.getTransactionByHash) throw Object.assign(new Error('SAFE_CHAIN_EVIDENCE_UNAVAILABLE'), { status: 503 });
  const receipt = await chain.getTransactionReceipt(txHash);
  const tx = await chain.getTransactionByHash(txHash);
  if (!receipt || receipt.status === '0x0' || receipt.status === 0 || receipt.status === false) throw Object.assign(new Error('SAFE_EXECUTION_NOT_SUCCESSFUL'), { status: 409 });
  if (!tx?.to || !orderPolicy.protocolAdminSafe || tx.to.toLowerCase() !== orderPolicy.protocolAdminSafe.toLowerCase()) throw Object.assign(new Error('SAFE_EXECUTION_TARGET_MISMATCH'), { status: 400 });
  const expectedEditionId = String(request.edition_id_hash ?? request.editionIdHash ?? request.request_payload?.editionId ?? request.requestPayload?.editionId ?? '').toLowerCase();
  const factory = orderPolicy.transactionTargets?.EDITION_CREATE?.toLowerCase();
  let execution = false; let executionHash = null; let editionEvent = null;
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() === orderPolicy.protocolAdminSafe.toLowerCase()) {
      try {
        const parsed = SAFE_EVIDENCE_ABI.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'ExecutionFailure') throw Object.assign(new Error('SAFE_EXECUTION_FAILED'), { status: 409 });
        if (parsed?.name === 'ExecutionSuccess') { execution = true; executionHash = parsed.args.txHash.toLowerCase(); }
      } catch (error) { if (error.status) throw error; }
    }
    if (factory && log.address?.toLowerCase() === factory) {
      try {
        const parsed = FACTORY_EVIDENCE_ABI.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === 'EditionCreated') editionEvent = parsed.args;
      } catch { /* unrelated factory log */ }
    }
  }
  if (!execution || (safeTransactionHash && executionHash !== safeTransactionHash.toLowerCase())) throw Object.assign(new Error('SAFE_EXECUTION_EVENT_REQUIRED'), { status: 409 });
  if (!editionEvent || String(editionEvent.editionId).toLowerCase() !== expectedEditionId) throw Object.assign(new Error('EDITION_CREATED_EVIDENCE_REQUIRED'), { status: 409 });
  const payload = request.request_payload ?? request.requestPayload ?? {};
  const predictedEdition = request.predicted_edition_address ?? request.predictedEditionAddress ?? payload.predictedEditionAddress ?? payload.predicted_edition_address;
  if (!predictedEdition || editionEvent.edition.toLowerCase() !== predictedEdition.toLowerCase()) throw Object.assign(new Error('SAFE_EDITION_ADDRESS_MISMATCH'), { status: 409 });
  if (editionEvent.protocolAdmin.toLowerCase() !== orderPolicy.protocolAdminSafe.toLowerCase()) throw Object.assign(new Error('SAFE_PROTOCOL_ADMIN_MISMATCH'), { status: 409 });
  const expectedController = orderPolicy.transactionTargets?.MINT;
  if (!expectedController || editionEvent.mintController.toLowerCase() !== expectedController.toLowerCase()) throw Object.assign(new Error('SAFE_MINT_CONTROLLER_MISMATCH'), { status: 409 });
  if (payload.publisher && editionEvent.publisher.toLowerCase() !== payload.publisher.toLowerCase()) throw Object.assign(new Error('SAFE_CALLDATA_PUBLISHER_MISMATCH'), { status: 409 });
  if (payload.absoluteSupplyCap != null && String(editionEvent.absoluteSupplyCap) !== String(payload.absoluteSupplyCap)) throw Object.assign(new Error('SAFE_CALLDATA_SUPPLY_MISMATCH'), { status: 409 });
  if (payload.artworkCommitment && editionEvent.artworkCommitment.toLowerCase() !== payload.artworkCommitment.toLowerCase()) throw Object.assign(new Error('SAFE_CALLDATA_ARTWORK_MISMATCH'), { status: 409 });
  if (payload.salt && editionEvent.salt.toLowerCase() !== payload.salt.toLowerCase()) throw Object.assign(new Error('SAFE_CALLDATA_SALT_MISMATCH'), { status: 409 });
  return { txHash: txHash.toLowerCase(), safeTransactionHash: safeTransactionHash?.toLowerCase() ?? null, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, edition: editionEvent.edition.toLowerCase(), editionId: editionEvent.editionId.toLowerCase(), verified: true };
}

export function productionOrderPolicy(env = process.env) {
  return {
    usdg: env.USDG_ADDRESS ?? '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
    protocolFeeRecipient: env.SECONDARY_FEE_RECIPIENT,
    royaltyVault: env.NEX_ROYALTY_VAULT_ADDRESS,
    zone: env.NEX_MARKETS_ZONE_ADDRESS,
    listingRegistry: env.NEX_LISTING_REGISTRY_ADDRESS,
    seaport: env.SEAPORT_16_ADDRESS ?? '0x0000000000000068F116a894984e2DB1123eB395',
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
  chain = null,
  subgraph = null,
  maxIndexerLagBlocks = 120,
  maxFinalityLagBlocks = 120,
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
        const subgraphStatus = requireIndexedReadiness && subgraph?.enabled ? await subgraph.indexingStatus() : null;
        const indexer = requireIndexedReadiness && !subgraphStatus ? await store.indexerHealth(chainId) : null;
        if (requireIndexedReadiness && !indexer && !subgraphStatus) throw Object.assign(new Error('INDEXER_NOT_READY'), { status: 503 });
        if (requireIndexedReadiness && !chain?.getBlockNumber) throw Object.assign(new Error('CHAIN_HEAD_UNAVAILABLE'), { status: 503 });
        let chainHead = null; let indexedLag = null; let finalityLag = null;
        if ((indexer || subgraphStatus) && chain?.getBlockNumber) {
          chainHead = await chain.getBlockNumber();
          const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0);
          const finalized = subgraphStatus ? landed : Number(indexer.finalized_watermark_block_number ?? indexer.finalized_block_number ?? 0);
          indexedLag = chainHead - landed; finalityLag = chainHead - finalized;
          if (indexedLag > maxIndexerLagBlocks || finalityLag > maxFinalityLagBlocks) throw Object.assign(new Error('INDEXER_STALE'), { status: 503 });
        }
        if (indexer || subgraphStatus) { const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0); metrics.set('nexmarkets_indexer_latest_block', landed); metrics.set('nexmarkets_indexer_lag_blocks', indexedLag ?? 0); }
        return json(res, 200, { status: 'ready', database: 'ok', indexer: (indexer || subgraphStatus) ? 'fresh' : 'not-required', indexerProvider: subgraphStatus ? 'GOLDSKY_SUBGRAPH' : indexer ? 'GOLDSKY_TURBO_DEPRECATED' : null, chainHead, landedBlock: subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : indexer ? Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0) : null, latestEventBlock: indexer ? Number(indexer.latest_event_block_number ?? indexer.latest_block_number ?? 0) : null, indexedLag, finalityLag, requestId });
      }
      if (req.method === 'GET' && url.pathname === '/metrics') { res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); return res.end(metrics.render()); }
      if (req.method === 'GET' && url.pathname === '/v1/discover') return json(res, 200, { data: subgraph?.enabled ? await subgraph.discover() : await store.discover(), authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL' : 'POSTGRES_READ_MODEL' });
      if (req.method === 'GET' && url.pathname === '/v1/market/listings') return json(res, 200, { data: subgraph?.enabled ? await subgraph.listings() : await store.listings(), authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL' : 'NEX_LISTING_REGISTRY_PROJECTION' });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/projects/')) return json(res, 200, { data: await store.projectBySlug(decodeURIComponent(url.pathname.slice(13))) });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/editions/')) return json(res, 200, { data: subgraph?.enabled ? await subgraph.editionByAddress(url.pathname.slice(13)) : await store.editionByAddress(url.pathname.slice(13)), authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL' : 'CHAIN_PROJECTION' });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/passes/')) { const [, , , edition, tokenId] = url.pathname.split('/'); return json(res, 200, { data: subgraph?.enabled ? await subgraph.pass(edition, tokenId) : await store.pass(edition, tokenId), authority: subgraph?.enabled ? 'GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_RPC_VERIFICATION' : 'CHAIN_PROJECTION' }); }

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
      if (req.method === 'GET' && url.pathname.startsWith('/v1/edition-requests/')) { const request = await store.editionRequestById(url.pathname.slice(21), session.accountId); if (!request) throw Object.assign(new Error('NOT_FOUND'), { status: 404 }); return json(res, 200, { data: request, authority: 'SAFE_WORKFLOW_REQUEST' }); }
      if (req.method === 'POST' && /^\/v1\/edition-requests\/[^/]+\/safe-submit$/.test(url.pathname)) {
        const requestId = url.pathname.split('/')[3]; const request = await store.editionRequestById(requestId, session.accountId); if (!request) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
        const input = await readBody(req); if (!/^0x[0-9a-fA-F]{64}$/.test(input.txHash ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(input.safeTransactionHash ?? '')) throw Object.assign(new Error('SAFE_TX_HASH_REQUIRED'), { status: 400 });
        const evidence = await verifySafeExecutionEvidence({ chain, request, txHash: input.txHash.toLowerCase(), safeTransactionHash: input.safeTransactionHash.toLowerCase(), orderPolicy });
        const submitted = await store.submitEditionRequest({ id: requestId, safeTransactionHash: input.safeTransactionHash.toLowerCase(), txHash: input.txHash.toLowerCase(), evidence });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'EDITION_SAFE_SUBMITTED', objectType: 'EDITION_REQUEST', objectId: submitted.id, requestId, correlationId, metadata: { txHash: submitted.txHash, safeTransactionHash: submitted.safeTransactionHash, evidence } });
        return json(res, 200, { data: submitted, authority: 'PROTOCOL_ADMIN_SAFE_EVIDENCE' });
      }
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

      if (req.method === 'POST' && url.pathname === '/v1/listings/signed-order') {
        const input = await readBody(req); const listing = await store.listing(input.orderHash ?? '');
        if (String(input.order?.offerer ?? '').toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error('SELLER_SESSION_MISMATCH'), { status: 403 });
        const computedHash = seaportOrderHash(input.order, input.counter);
        if (computedHash.toLowerCase() !== String(input.orderHash).toLowerCase()) throw Object.assign(new Error('ORDER_HASH_MISMATCH'), { status: 400 });
        if (listing) validateProjectedNexMarketsOrder(input.order, listing, orderPolicy);
        else if (String(input.order.zone).toLowerCase() !== String(orderPolicy.zone).toLowerCase()) throw Object.assign(new Error('ZONE_MISMATCH'), { status: 400 });
        verifySeaportOrderSignature({ order: input.order, counter: input.counter, signature: input.signature, chainId: session.chainId, seaport: orderPolicy.seaport });
        const stored = await store.storeSignedOrder({ accountId: session.accountId, chainId: session.chainId, orderHash: computedHash, seller: session.walletAddress, order: input.order, counter: input.counter, signature: input.signature });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'SEAPORT_ORDER_STORED', objectType: 'LISTING', objectId: computedHash, requestId, correlationId });
        return json(res, 201, { data: stored, authority: 'SIGNED_ORDER_CAPABILITY_ONLY' });
      }

      if (req.method === 'POST' && url.pathname === '/v1/listings/buy') {
        const input = await readBody(req); const idempotencyKey = req.headers['idempotency-key']?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'), { status: 400 });
        const signed = await store.signedOrder(input.orderHash ?? '');
        if (!signed || signed.status !== 'ACTIVE' || new Date(signed.expires_at ?? signed.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error('ACTIVE_SIGNED_LISTING_REQUIRED'), { status: 409 });
        const order = signed.order_payload ?? signed.order;
        const listing = await store.listing(input.orderHash); validateProjectedNexMarketsOrder(order, listing, orderPolicy);
        verifySeaportOrderSignature({ order, counter: signed.counter, signature: signed.signature, chainId: session.chainId, seaport: orderPolicy.seaport });
        const prepared = buildSeaportFulfillment({ order, signature: signed.signature, seaport: orderPolicy.seaport });
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: 'LISTING_BUY', intentId: input.orderHash, idempotencyKey, correlationId, requestId, toAddress: prepared.to, calldata: prepared.data });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'TRANSACTION_PREPARED', objectType: 'CHAIN_TRANSACTION', objectId: transaction.id, requestId, correlationId, metadata: { intentType: 'LISTING_BUY', orderHash: input.orderHash } });
        return json(res, 201, { transaction, prepared, totalBuyerPayment: String(listing.price_usdg ?? listing.priceUsdg), walletMustSign: true, serverCustodiesKey: false });
      }

      if (req.method === 'POST' && INTENT_TYPE[url.pathname]) {
        const input = await readBody(req); const idempotencyKey = req.headers['idempotency-key']?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error('IDEMPOTENCY_KEY_REQUIRED'), { status: 400 });
        let prepared = { calldata: input.calldata ?? null, payload: input }; let workflowPayload = input;
        if (url.pathname === '/v1/listings/prepare') {
          if (String(input.seller).toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error('SELLER_SESSION_MISMATCH'), { status: 403 });
          // Deployment policy wins over untrusted request fields.
          prepared = buildNexMarketsOrder({ ...input, ...orderPolicy });
          if (prepared.orderHash) prepared.typedData = seaportTypedData(prepared.order, input.counter, { chainId: session.chainId, seaport: orderPolicy.seaport });
        } else {
          const intentType = INTENT_TYPE[url.pathname]; const target = orderPolicy.transactionTargets?.[intentType];
          if (!isAddress(target ?? '')) throw Object.assign(new Error('CONTRACT_CONFIGURATION_REQUIRED'), { status: 503 });
          if (input.to !== undefined && (!isAddress(input.to) || getAddress(input.to) !== getAddress(target))) throw Object.assign(new Error('TRANSACTION_TARGET_REJECTED'), { status: 400 });
          let calldata = input.calldata; let protocolInput = input;
          if (intentType === 'EDITION_CREATE') {
            if (!input.projectId) throw Object.assign(new Error('PROJECT_ID_REQUIRED'), { status: 400 });
            if (!isAddress(orderPolicy.protocolAdminSafe ?? '')) throw Object.assign(new Error('PROTOCOL_ADMIN_SAFE_CONFIGURATION_REQUIRED'), { status: 503 });
            if (input.initialOwner !== undefined && getAddress(input.initialOwner) !== getAddress(orderPolicy.protocolAdminSafe)) throw Object.assign(new Error('PROTOCOL_ADMIN_SAFE_REQUIRED'), { status: 400 });
            protocolInput = { ...input, initialOwner: orderPolicy.protocolAdminSafe, protocolAdmin: orderPolicy.protocolAdminSafe, mintController: orderPolicy.transactionTargets?.MINT ?? null };
            const predictedEditionAddress = predictEditionAddress({ factoryAddress: target, ...protocolInput });
            protocolInput = { ...protocolInput, predictedEditionAddress };
            workflowPayload = protocolInput;
            calldata = undefined;
          }
          if (intentType === 'TERMS_PUBLISH') {
            if (!isAddress(input.edition ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(input.terms?.advantagesHash ?? '')) throw Object.assign(new Error('TERMS_COMMITMENT_REQUIRED'), { status: 400 });
            const computedAdvantagesHash = canonicalAdvantagesHash(input.advantageConfigs ?? []);
            if (!computedAdvantagesHash || computedAdvantagesHash.toLowerCase() !== input.terms.advantagesHash.toLowerCase()) throw Object.assign(new Error('ADVANTAGES_COMMITMENT_MISMATCH'), { status: 400 });
            await store.saveTermsCommitment?.({ builderAccountId: session.accountId, editionAddress: input.edition, advantagesHash: input.terms.advantagesHash, termsPayload: input.terms, configs: input.advantageConfigs ?? [] });
            // The persisted commitment and calldata must describe the same
            // Terms snapshot; callers cannot substitute opaque calldata here.
            calldata = undefined;
          }
          if (calldata === undefined) calldata = buildProtocolCalldata(intentType, protocolInput, { walletAddress: session.walletAddress, idempotencyKey });
          if (!/^0x[0-9a-fA-F]+$/.test(calldata ?? '') || !INTENT_SELECTORS[intentType]?.includes(calldata.slice(0, 10).toLowerCase())) throw Object.assign(new Error('CALLDATA_SELECTOR_REJECTED'), { status: 400 });
          prepared = { to: getAddress(target), data: calldata, value: '0x0', ...(intentType === 'EDITION_CREATE' ? { predictedEditionAddress: protocolInput.predictedEditionAddress } : {}) };
        }
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: INTENT_TYPE[url.pathname], intentId: input.intentId ?? idempotencyKey, idempotencyKey, correlationId, requestId, toAddress: prepared.to ?? prepared.registryTransaction?.to ?? null, calldata: prepared.data ?? prepared.registryTransaction?.data ?? null });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: 'TRANSACTION_PREPARED', objectType: 'CHAIN_TRANSACTION', objectId: transaction.id, requestId, correlationId, metadata: { intentType: INTENT_TYPE[url.pathname] } });
        if (INTENT_TYPE[url.pathname] === 'EDITION_CREATE') {
          const request = await store.createEditionRequest({ projectId: input.projectId, builderAccountId: session.accountId, chainId: session.chainId, payload: workflowPayload, transactionId: transaction.id });
          const safePending = await store.markEditionRequestSafePending?.(request.id, session.accountId) ?? request;
          return json(res, 201, { transaction, request: safePending, safeProposal: prepared, safeRequired: true, walletMustSign: false, serverCustodiesKey: false });
        }
        return json(res, 201, { transaction, prepared, walletMustSign: true, serverCustodiesKey: false });
      }
      return json(res, 404, { error: { code: 'NOT_FOUND', requestId } });
    } catch (error) {
      metrics.increment('nexmarkets_api_failures_total');
      const clientFailure = /(?:INVALID|MISMATCH|REJECTED|REQUIRED|CONFLICT|expired|consumed|challenge|signature|wrong|extra|surcharge|price|tokenId|listing|seller|zoneHash|royaltyBps|CALLDATA|TARGET|PROJECT_BUILDER)/i.test(error.message);
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
  const store = new PostgresStore(); const port = Number(process.env.PORT || 4010); const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663); const rpc = new JsonRpcClient(chainId === 46630 ? (process.env.RH_TESTNET_RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com') : (process.env.RH_MAINNET_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com')); const subgraph = new SubgraphClient({ endpoint: process.env.NEXMARKETS_SUBGRAPH_URL });
  const server = createApiServer({ store, chainId, chain: rpc, subgraph, maxIndexerLagBlocks: Number(process.env.INDEXER_MAX_LAG_BLOCKS ?? 120), maxFinalityLagBlocks: Number(process.env.INDEXER_MAX_FINALITY_LAG_BLOCKS ?? 120), orderPolicy: productionOrderPolicy(), requireIndexedReadiness: process.env.NODE_ENV === 'production' });
  server.listen(port, () => console.log(JSON.stringify({ event: 'api_started', port })));
  const shutdown = async () => { server.close(); await store.close(); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
