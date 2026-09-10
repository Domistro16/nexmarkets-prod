import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Interface, Wallet, id } from 'ethers';
import { createApiServer, createNetworkConfigs, RateLimiter, predictEditionAddress } from '../apps/api/src/server.mjs';
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
  const sessionCheck = await fetch(`${base}/v1/me/session`, { headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' } });
  assert.equal(sessionCheck.status, 200);
  const sessionData = await sessionCheck.json();
  assert.equal(sessionData.authenticated, true);
  assert.equal(sessionData.wallet.toLowerCase(), wallet.address.toLowerCase());
  assert.ok(sessionData.csrfToken);
  const logout = await fetch(`${base}/v1/auth/logout`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': sessionData.csrfToken, origin: 'https://nexmarkets.fun' } });
  assert.equal(logout.status, 200);
  const after = await fetch(`${base}/v1/me/passes`, { headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' } });
  assert.equal(after.status, 401);
  const afterSession = await fetch(`${base}/v1/me/session`, { headers: { cookie: auth.cookie, origin: 'https://nexmarkets.fun' } });
  assert.equal(afterSession.status, 401);
  const unauthedSession = await fetch(`${base}/v1/me/session`, { headers: { origin: 'https://nexmarkets.fun' } });
  assert.equal(unauthedSession.status, 401);
});

test('mutations enforce CSRF, idempotency, owner session, and no server key custody', async (t) => {
  const { server, base } = await running(); t.after(() => server.close());
  const auth = await authenticate(base, Wallet.createRandom());
  const missingCsrf = await fetch(`${base}/v1/builder/projects`, { method: 'POST', headers: { cookie: auth.cookie, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ slug: 'my-project', name: 'My Project', intent: 'DRAFT' }) });
  assert.equal(missingCsrf.status, 403);
  const project = await fetch(`${base}/v1/builder/projects`, { method: 'POST', headers: { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ slug: 'my-project', name: 'My Project', intent: 'DRAFT' }) });
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

test('V1 API refuses multi-unit redemption calldata until the V2 contracts are configured', async (t) => {
  const target = '0x6666666666666666666666666666666666666666';
  const { server, base } = await running({ orderPolicy: { transactionTargets: { ADVANTAGE_USE: target } } });
  t.after(() => server.close());
  const auth = await authenticate(base, Wallet.createRandom());
  const calldata = new Interface(['function redeemAmount(address,uint256,bytes32,uint256,bytes32)'])
    .encodeFunctionData('redeemAmount', ['0x5555555555555555555555555555555555555555', 1, `0x${'11'.repeat(32)}`, 2, `0x${'22'.repeat(32)}`]);
  const response = await fetch(`${base}/v1/advantages/consume`, {
    method: 'POST',
    headers: {
      cookie: auth.cookie,
      'x-csrf-token': auth.verified.csrfToken,
      'idempotency-key': 'v1-multi-redeem',
      'content-type': 'application/json',
      origin: 'https://nexmarkets.fun'
    },
    body: JSON.stringify({ to: target, calldata, operation: 'REDEEM_AMOUNT' })
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'PROTOCOL_V2_REQUIRED');
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

test('Edition creation has no API or Safe approval workflow', async (t) => {
  const { server, base } = await running(); t.after(() => server.close());
  const builder = Wallet.createRandom(); const auth = await authenticate(base, builder);
  const headers = { cookie: auth.cookie, 'x-csrf-token': auth.verified.csrfToken, 'content-type': 'application/json', origin: 'https://nexmarkets.fun', 'idempotency-key': 'permissionless-edition' };
  const prepare = await fetch(`${base}/v1/editions/prepare`, { method: 'POST', headers, body: '{}' });
  const evidence = await fetch(`${base}/v1/edition-requests/legacy/safe-submit`, { method: 'POST', headers, body: '{}' });
  assert.equal(prepare.status, 404);
  assert.equal(evidence.status, 404);
});

test('Factory CREATE2 prediction binds the complete Edition config', () => {
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

test('/readyz uses Goldsky Subgraph indexed progress against the RPC head', async (t) => {
  const subgraph = { enabled: true, async indexingStatus() { return { indexedBlock: 1000, blockHash: `0x${'11'.repeat(32)}`, deployment: 'Qmtest' }; } };
  const { server, base, store } = await running({ requireIndexedReadiness: true, subgraph, chain: { async getBlockNumber() { return 1005; } }, maxIndexerLagBlocks: 10, maxFinalityLagBlocks: 10 }); t.after(() => server.close());
  store.indexerHealth = async () => { throw new Error('Turbo fallback must not be queried when Subgraph is configured'); };
  const response = await fetch(`${base}/readyz`, { headers: { origin: 'https://nexmarkets.fun' } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.indexerProvider, 'GOLDSKY_SUBGRAPH');
  assert.equal(body.landedBlock, 1000);
  assert.equal(body.indexedLag, 5);
});

test('API selects Base Sepolia by network header and does not serve Robinhood projections', async (t) => {
  const networkConfigs = createNetworkConfigs({});
  assert.equal(networkConfigs['base-sepolia'].orderPolicy.usdg.toLowerCase(), '0x036cbd53842c5426634e7929541ec2318f3dcf7e');
  assert.equal(networkConfigs['base-sepolia'].orderPolicy.transactionTargets.MINT, '0xe68Fc831a441eeA79865A890a279514C8C797677');
  assert.equal(networkConfigs['base-mainnet'].orderPolicy.transactionTargets.MINT, undefined);
  const isolatedNetworkConfigs = {
    ...networkConfigs,
    'base-sepolia': {
      ...networkConfigs['base-sepolia'],
      subgraph: { enabled: true, async discover() { return []; } }
    }
  };
  const { server, base } = await running({ chainId: 46630, networkConfigs: isolatedNetworkConfigs }); t.after(() => server.close());
  const challenge = await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nex-network': 'base-sepolia', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ address: Wallet.createRandom().address }) });
  assert.equal(challenge.status, 201);
  assert.equal((await challenge.json()).chainId, 84532);
  const discover = await fetch(`${base}/v1/discover`, { headers: { 'x-nex-network': 'base-sepolia', origin: 'https://nexmarkets.fun' } });
  assert.equal(discover.status, 200);
  assert.deepEqual((await discover.json()).data, []);
});
