import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet, id } from 'ethers';
import { createApiServer, RateLimiter } from '../apps/api/src/server.mjs';
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
