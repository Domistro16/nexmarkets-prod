import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

test('authenticated listing preparation emits the exact Zone-compatible USDG order', async (t) => {
  const store = new MemoryStore();
  const policy = {
    usdg: '0x3333333333333333333333333333333333333333', protocolFeeRecipient: '0x4444444444444444444444444444444444444444',
    royaltyVault: '0x5555555555555555555555555555555555555555', zone: '0x6666666666666666666666666666666666666666'
  };
  const server = createApiServer({ store, allowedOrigin: 'https://nexmarkets.fun', secureCookies: false, orderPolicy: policy });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`; const wallet = Wallet.createRandom();
  const challenge = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ address: wallet.address }) })).json();
  const verifiedResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
  const verified = await verifiedResponse.json(); const cookie = verifiedResponse.headers.get('set-cookie').split(';')[0];
  const input = {
    seller: wallet.address, currentOwner: wallet.address, edition: '0x2222222222222222222222222222222222222222', tokenId: '1', price: '1000000', royaltyBps: '500',
    zoneHash: `0x${'77'.repeat(32)}`, startTime: '100', endTime: '200', now: '99'
  };
  const response = await fetch(`${base}/v1/listings/prepare`, { method: 'POST', headers: { cookie, 'x-csrf-token': verified.csrfToken, 'idempotency-key': 'listing-1', 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify(input) });
  assert.equal(response.status, 201); const result = await response.json();
  assert.deepEqual(result.prepared.amounts, { price: '1000000', protocolFee: '10000', royalty: '50000', sellerProceeds: '940000' });
  assert.equal(result.prepared.order.consideration[1].recipient, policy.royaltyVault);
});

test('listing request cannot override USDG, Zone, fee recipient, or RoyaltyVault deployment policy', async (t) => {
  const store = new MemoryStore();
  const policy = {
    usdg: '0x3333333333333333333333333333333333333333', protocolFeeRecipient: '0x4444444444444444444444444444444444444444',
    royaltyVault: '0x5555555555555555555555555555555555555555', zone: '0x6666666666666666666666666666666666666666'
  };
  const server = createApiServer({ store, allowedOrigin: 'https://nexmarkets.fun', secureCookies: false, orderPolicy: policy });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`; const wallet = Wallet.createRandom();
  const challenge = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ address: wallet.address }) })).json();
  const verifiedResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
  const verified = await verifiedResponse.json(); const cookie = verifiedResponse.headers.get('set-cookie').split(';')[0];
  const evil = '0x9999999999999999999999999999999999999999';
  const input = { seller: wallet.address, currentOwner: wallet.address, edition: '0x2222222222222222222222222222222222222222', tokenId: '1', price: '1000000', royaltyBps: '500', zoneHash: `0x${'77'.repeat(32)}`, startTime: '100', endTime: '200', now: '99', usdg: evil, protocolFeeRecipient: evil, royaltyVault: evil, zone: evil };
  const response = await fetch(`${base}/v1/listings/prepare`, { method: 'POST', headers: { cookie, 'x-csrf-token': verified.csrfToken, 'idempotency-key': 'locked-policy', 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify(input) });
  const result = await response.json(); assert.equal(response.status, 201);
  assert.equal(result.prepared.order.zone, policy.zone); assert.equal(result.prepared.order.consideration[0].token, policy.usdg);
  assert.equal(result.prepared.order.consideration[0].recipient, policy.protocolFeeRecipient); assert.equal(result.prepared.order.consideration[1].recipient, policy.royaltyVault);
});
