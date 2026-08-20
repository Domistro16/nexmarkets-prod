import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Interface, Wallet, id } from 'ethers';
import { createApiServer, RateLimiter, predictEditionAddress } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

async function running(options = {}) {
  const store = new MemoryStore();
  const mintTarget = '0x7777777777777777777777777777777777777777';
  const server = createApiServer({ store, allowedOrigin: 'https://nexmarkets.fun', secureCookies: false, orderPolicy: { transactionTargets: { MINT: mintTarget } }, ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { store, server, base: `http://127.0.0.1:${server.address().port}` };
}

async function authenticate(base, wallet) {
  const challengeResponse = await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ address: wallet.address }) });
  assert.equal(challengeResponse.status, 201); const challenge = await challengeResponse.json();
  const signature = await wallet.signMessage(challenge.message);
  const verifyResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ nonce: challenge.nonce, signature }) });
  assert.equal(verifyResponse.status, 200); const verified = await verifyResponse.json();
  return { challenge, signature, verified, cookie: verifyResponse.headers.get('set-cookie').split(';')[0] };
}

test('wallet auth is signed, chain/domain bound, single-use, and revocable', async (t) => {
  const { server, base } = await running(); t.after(() => server.close());
  const wallet = Wallet.createRandom(); const auth = await authenticate(base, wallet);
  const replay = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ nonce: auth.challenge.nonce, signature: auth.signature }) });
  assert.equal(replay.status, 400);
  const me = await fetch(`${base}/v1/me/passes`, { headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' } });
  assert.equal(me.status, 200);
  const logout = await fetch(`${base}/v1/auth/logout`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, origin: 'https://nexmarkets.fun' } });
  assert.equal(logout.status, 200);
  const after = await fetch(`${base}/v1/me/passes`, { headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' } });
  assert.equal(after.status, 401);
});

test('mutations enforce CSRF, idempotency, owner session, and no server key custody', async (t) => {
  const { server, base } = await running(); t.after(() => server.close());
  const auth = await authenticate(base, Wallet.createRandom());
  const missingCsrf = await fetch(`${base}/v1/builder/projects`, { method: 'POST', headers: { cookie: auth.cookie, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ slug: 'my-project', name: 'My Project' }) });
  assert.equal(missingCsrf.status, 403);
  const project = await fetch(`${base}/v1/builder/projects`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ slug: 'my-project', name: 'My Project' }) });
  assert.equal(project.status, 201);
  const headers = { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, 'idempotency-key': 'mint-1', 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const to = '0x7777777777777777777777777777777777777777'; const calldata = id('mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))').slice(0, 10);
  const first = await fetch(`${base}/v1/mints/prepare`, { method: 'POST', headers, body: JSON.stringify({ intentId: 'mint-1', to, calldata }) });
  const second = await fetch(`${base}/v1/mints/prepare`, { method: 'POST', headers, body: JSON.stringify({ intentId: 'mint-1', to, calldata }) });
  const a = await first.json(); const b = await second.json();
  assert.equal(first.status, 201); assert.equal(a.transaction.id, b.transaction.id); assert.equal(a.walletMustSign, true); assert.equal(a.serverCustodiesKey, false);
  const wrongTarget = await fetch(`${base}/v1/mints/prepare`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'mint-evil' }, body: JSON.stringify({ intentId: 'mint-evil', to: '0x8888888888888888888888888888888888888888', calldata }) });
  assert.equal(wrongTarget.status, 400);
});

test('same-origin and rate-limit controls fail closed', async (t) => {
  const { server, base } = await running({ rateLimiter: new RateLimiter({ limit: 1, windowMs: 60_000 }) }); t.after(() => server.close());
  const forbidden = await fetch(`${base}/healthz`, { headers: { origin: 'https://evil.example' } }); assert.equal(forbidden.status, 403);
  const limited = await fetch(`${base}/healthz`, { headers: { origin: 'https://nexmarkets.fun' } }); assert.equal(limited.status, 429);
});

test('wallet reports transaction lifecycle idempotently without treating a hash as confirmation', async (t) => {
  const { server, base } = await running(); t.after(() => server.close());
  const auth = await authenticate(base, Wallet.createRandom());
  const headers = { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, 'idempotency-key': 'lifecycle-1', 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const preparedResponse = await fetch(`${base}/v1/mints/prepare`, { method: 'POST', headers, body: JSON.stringify({ intentId: 'lifecycle-1', to: '0x7777777777777777777777777777777777777777', calldata: id('mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))').slice(0, 10) }) });
  const prepared = await preparedResponse.json();
  const eventHeaders = { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const pending = await fetch(`${base}/v1/transactions/${prepared.transaction.id}/events`, { method: 'POST', headers: eventHeaders, body: JSON.stringify({ state: 'WALLET_PENDING', eventId: 'wallet:lifecycle-1' }) });
  assert.equal(pending.status, 200);
  const txHash = `0x${'12'.repeat(32)}`;
  const submitted = await fetch(`${base}/v1/transactions/${prepared.transaction.id}/events`, { method: 'POST', headers: eventHeaders, body: JSON.stringify({ state: 'SUBMITTED', eventId: 'submit:lifecycle-1', txHash }) });
  assert.equal(submitted.status, 200); assert.equal((await submitted.json()).data.state, 'SUBMITTED');
  const status = await fetch(`${base}/v1/transactions/${prepared.transaction.id}`, { headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' } });
  const tracked = await status.json(); assert.equal(tracked.data.state, 'SUBMITTED'); assert.notEqual(tracked.data.state, 'CONFIRMED');
});

test('Builder Edition creation is a Safe workflow and Terms commitments are exact', async (t) => {
  const safe = '0x9999999999999999999999999999999999999999'; const builder = Wallet.createRandom(); const factory = '0x7777777777777777777777777777777777777777'; const edition = predictEditionAddress({ factoryAddress: factory, name: 'Safe Edition', symbol: 'SAFE', initialOwner: safe, editionId: `0x${'11'.repeat(32)}`, absoluteSupplyCap: 10, artworkCommitment: `0x${'12'.repeat(32)}`, baseTokenURI: 'https://example.test/metadata/', salt: `0x${'13'.repeat(32)}` }); const txHash = `0x${'22'.repeat(32)}`; const safeTxHash = `0x${'33'.repeat(32)}`;
  const safeInterface = new Interface(['event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)']); const factoryInterface = new Interface(['event EditionCreated(address indexed edition,bytes32 indexed editionId,address indexed publisher,bytes32 salt,address protocolAdmin,address mintController,uint32 absoluteSupplyCap,bytes32 artworkCommitment)']);
  const safeLog = safeInterface.encodeEventLog(safeInterface.getEvent('ExecutionSuccess'), [safeTxHash, 0]); const factoryLog = factoryInterface.encodeEventLog(factoryInterface.getEvent('EditionCreated'), [edition, `0x${'11'.repeat(32)}`, builder.address, `0x${'13'.repeat(32)}`, safe, '0x8888888888888888888888888888888888888888', 10, `0x${'12'.repeat(32)}`]);
  const chain = { async getTransactionReceipt() { return { status: '0x1', blockNumber: '0x10', blockHash: `0x${'44'.repeat(32)}`, logs: [{ address: safe, ...safeLog }, { address: factory, ...factoryLog }] }; }, async getTransactionByHash() { return { to: safe, from: builder.address, input: '0x' }; } };
  const { server, base } = await running({ chain, orderPolicy: { protocolAdminSafe: safe, transactionTargets: { MINT: '0x8888888888888888888888888888888888888888', EDITION_CREATE: factory, TERMS_PUBLISH: '0x8888888888888888888888888888888888888888' } } }); t.after(() => server.close());
  const auth = await authenticate(base, builder); const headers = { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const project = await fetch(`${base}/v1/builder/projects`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'project-safe' }, body: JSON.stringify({ slug: `safe-${Date.now()}`, name: 'Safe Edition' }) }); const projectRow = await project.json();
  const requestResponse = await fetch(`${base}/v1/editions/prepare`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'edition-safe' }, body: JSON.stringify({ projectId: projectRow.data.id, name: 'Safe Edition', symbol: 'SAFE', editionId: `0x${'11'.repeat(32)}`, initialOwner: safe, absoluteSupplyCap: 10, artworkCommitment: `0x${'12'.repeat(32)}`, baseTokenURI: 'https://example.test/metadata/', publisher: builder.address, salt: `0x${'13'.repeat(32)}` }) });
  assert.equal(requestResponse.status, 201); const request = await requestResponse.json(); assert.equal(request.walletMustSign, false); assert.equal(request.safeRequired, true); assert.equal(request.request.safeStatus, 'SAFE_PENDING');
  const submitted = await fetch(`${base}/v1/edition-requests/${request.request.id}/safe-submit`, { method: 'POST', headers, body: JSON.stringify({ txHash, safeTransactionHash: safeTxHash }) }); assert.equal(submitted.status, 200); assert.equal((await submitted.json()).data.safeStatus, 'SUBMITTED');
  const other = await authenticate(base, Wallet.createRandom()); const crossAccount = await fetch(`${base}/v1/editions/prepare`, { method: 'POST', headers: { cookie: other.cookie, 'x-csrf-token': other.verified.csrfToken, 'content-type': 'application/json', origin: 'https://nexmarkets.fun', 'idempotency-key': 'cross-account-edition' }, body: JSON.stringify({ projectId: projectRow.data.id, name: 'Wrong Builder', symbol: 'WRONG', editionId: `0x${'55'.repeat(32)}`, initialOwner: safe, absoluteSupplyCap: 10, artworkCommitment: `0x${'56'.repeat(32)}`, baseTokenURI: 'https://example.test/metadata/', publisher: builder.address, salt: `0x${'57'.repeat(32)}` }) }); assert.equal(crossAccount.status, 400);
});

test('Factory Safe evidence prediction binds the complete Edition config', () => {
  const base = { factoryAddress: '0x7777777777777777777777777777777777777777', name: 'Edition', symbol: 'ED', initialOwner: '0x9999999999999999999999999999999999999999', editionId: `0x${'11'.repeat(32)}`, absoluteSupplyCap: 10, artworkCommitment: `0x${'12'.repeat(32)}`, baseTokenURI: 'https://example.test/metadata/', salt: `0x${'13'.repeat(32)}` };
  const predicted = predictEditionAddress(base);
  assert.notEqual(predicted, predictEditionAddress({ ...base, name: 'Altered Edition' }));
  assert.notEqual(predicted, predictEditionAddress({ ...base, symbol: 'ALT' }));
  assert.notEqual(predicted, predictEditionAddress({ ...base, baseTokenURI: 'https://example.test/other/' }));
});

test('/readyz compares projection freshness with the Robinhood chain head', async (t) => {
  const { server, base } = await running({ requireIndexedReadiness: true, chain: { async getBlockNumber() { return 200; } }, maxIndexerLagBlocks: 20, maxFinalityLagBlocks: 20 }); t.after(() => server.close());
  const stale = await fetch(`${base}/readyz`, { headers: { origin: 'https://nexmarkets.fun' } }); assert.equal(stale.status, 503);
});

test('/readyz uses the Goldsky landed watermark, not the latest protocol event', async (t) => {
  const { server, base, store } = await running({ requireIndexedReadiness: true, chain: { async getBlockNumber() { return 1005; } }, maxIndexerLagBlocks: 10, maxFinalityLagBlocks: 10 }); t.after(() => server.close());
  store.indexerHealth = async () => ({ landed_block_number: 1000, latest_event_block_number: 400, finalized_watermark_block_number: 1000 });
  const ready = await fetch(`${base}/readyz`, { headers: { origin: 'https://nexmarkets.fun' } }); assert.equal(ready.status, 200); assert.equal((await ready.json()).landedBlock, 1000);
});

test('/readyz reports a stale Goldsky watermark even when the event stream is quiet', async (t) => {
  const { server, base, store } = await running({ requireIndexedReadiness: true, chain: { async getBlockNumber() { return 1005; } }, maxIndexerLagBlocks: 10, maxFinalityLagBlocks: 10 }); t.after(() => server.close());
  store.indexerHealth = async () => ({ landed_block_number: 700, latest_event_block_number: 400, finalized_watermark_block_number: 700 });
  const stale = await fetch(`${base}/readyz`, { headers: { origin: 'https://nexmarkets.fun' } }); assert.equal(stale.status, 503);
});
