import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet, id } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

async function browserSession(base, wallet) {
  const json = (value) => ({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify(value) });
  const challenge = await (await fetch(`${base}/v1/auth/challenge`, json({ address: wallet.address }))).json();
  const verifiedResponse = await fetch(`${base}/v1/auth/verify`, json({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }));
  const verified = await verifiedResponse.json(); return { cookie: verifiedResponse.headers.get('set-cookie').split(';')[0], csrf: verified.csrfToken };
}

test('local browser workflow follows Builder request and holder transaction lifecycle', async (t) => {
  const store = new MemoryStore(); const wallet = Wallet.createRandom(); const safe = '0x9999999999999999999999999999999999999999'; const server = createApiServer({ store, secureCookies: false, orderPolicy: { protocolAdminSafe: safe, transactionTargets: { MINT: '0x7777777777777777777777777777777777777777', EDITION_CREATE: '0x8888888888888888888888888888888888888888' } } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close()); const base = `http://127.0.0.1:${server.address().port}`; const session = await browserSession(base, wallet); const headers = { cookie: session.cookie, 'x-csrf-token': session.csrf, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const project = await (await fetch(`${base}/v1/builder/projects`, { ...headers, method: 'POST', headers: { ...headers, 'idempotency-key': 'browser-project' }, body: JSON.stringify({ slug: `browser-${Date.now()}`, name: 'Browser flow' }) })).json();
  const prepared = await (await fetch(`${base}/v1/editions/prepare`, { ...headers, method: 'POST', headers: { ...headers, 'idempotency-key': 'browser-edition' }, body: JSON.stringify({ projectId: project.data.id, name: 'Browser Edition', symbol: 'BROW', editionId: `0x${'ab'.repeat(32)}`, initialOwner: safe.address, absoluteSupplyCap: 10, artworkCommitment: `0x${'ac'.repeat(32)}`, baseTokenURI: 'https://example.test/metadata/', publisher: wallet.address, salt: `0x${'ad'.repeat(32)}` }) })).json();
  assert.equal(prepared.safeRequired, true); const request = await (await fetch(`${base}/v1/edition-requests/${prepared.request.id}`, { headers: { cookie: session.cookie, origin: 'https://nexmarkets.fun' } })).json(); assert.equal(request.data.safeStatus, 'SAFE_PENDING');
  const mint = await (await fetch(`${base}/v1/mints/prepare`, { ...headers, method: 'POST', headers: { ...headers, 'idempotency-key': 'browser-mint' }, body: JSON.stringify({ intentId: 'browser-mint', to: '0x7777777777777777777777777777777777777777', calldata: id('mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))').slice(0, 10) }) })).json();
  const lifecycleHeaders = { cookie: session.cookie, 'x-csrf-token': session.csrf, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }; await fetch(`${base}/v1/transactions/${mint.transaction.id}/events`, { method: 'POST', headers: lifecycleHeaders, body: JSON.stringify({ state: 'WALLET_PENDING', eventId: 'browser:pending' }) }); const submitted = await fetch(`${base}/v1/transactions/${mint.transaction.id}/events`, { method: 'POST', headers: lifecycleHeaders, body: JSON.stringify({ state: 'SUBMITTED', txHash: `0x${'cd'.repeat(32)}`, eventId: 'browser:submitted' }) }); assert.equal((await submitted.json()).data.state, 'SUBMITTED');
});
