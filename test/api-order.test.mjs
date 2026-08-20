import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Wallet } from 'ethers';
import { createApiServer } from '../apps/api/src/server.mjs';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';
import { buildNexMarketsOrder, seaportTypedData } from '../packages/domain/src/index.mjs';

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

test('seller signature is verified and an active listing prepares exact Seaport fulfillment', async (t) => {
  const store = new MemoryStore(); const wallet = Wallet.createRandom(); const now = Math.floor(Date.now() / 1000);
  const policy = {
    usdg: '0x3333333333333333333333333333333333333333', protocolFeeRecipient: '0x4444444444444444444444444444444444444444',
    royaltyVault: '0x5555555555555555555555555555555555555555', zone: '0x6666666666666666666666666666666666666666',
    seaport: '0x0000000000000068F116a894984e2DB1123eB395'
  };
  const source = { ...policy, seller: wallet.address, edition: '0x2222222222222222222222222222222222222222', tokenId: 1n, price: 1_000_000n, royaltyBps: 500n, termsVersionHash: `0x${'aa'.repeat(32)}`, royaltyReceiver: '0x7777777777777777777777777777777777777777', startTime: BigInt(now - 5), endTime: BigInt(now + 3600), counter: 3n };
  const built = buildNexMarketsOrder(source);
  store.listingRows.push({ order_hash: built.orderHash, status: 'ACTIVE', seller_address: wallet.address, edition_address: source.edition, token_id: '1', zone_hash: built.order.zoneHash, price_usdg: '1000000', protocol_fee_usdg: '10000', royalty_usdg: '50000', seller_proceeds_usdg: '940000', starts_at: new Date((now - 5) * 1000).toISOString(), expires_at: new Date((now + 3600) * 1000).toISOString() });
  const server = createApiServer({ store, allowedOrigin: 'https://nexmarkets.fun', secureCookies: false, orderPolicy: policy });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => server.close()); const base = `http://127.0.0.1:${server.address().port}`;
  const challenge = await (await fetch(`${base}/v1/auth/challenge`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ address: wallet.address }) })).json();
  const verifiedResponse = await fetch(`${base}/v1/auth/verify`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nexmarkets.fun' }, body: JSON.stringify({ nonce: challenge.nonce, signature: await wallet.signMessage(challenge.message) }) });
  const verified = await verifiedResponse.json(); const cookie = verifiedResponse.headers.get('set-cookie').split(';')[0]; const headers = { cookie, 'x-csrf-token': verified.csrfToken, 'content-type': 'application/json', origin: 'https://nexmarkets.fun' };
  const typed = seaportTypedData(built.order, 3n, { chainId: 4663, seaport: policy.seaport }); const signature = await wallet.signTypedData(typed.domain, typed.types, typed.value);
  const wrongSignature = await Wallet.createRandom().signTypedData(typed.domain, typed.types, typed.value);
  const rejected = await fetch(`${base}/v1/listings/signed-order`, { method: 'POST', headers, body: JSON.stringify({ orderHash: built.orderHash, order: built.order, counter: '3', signature: wrongSignature }, (_, value) => typeof value === 'bigint' ? value.toString() : value) });
  assert.equal(rejected.status, 400);
  const storedResponse = await fetch(`${base}/v1/listings/signed-order`, { method: 'POST', headers, body: JSON.stringify({ orderHash: built.orderHash, order: built.order, counter: '3', signature }, (_, value) => typeof value === 'bigint' ? value.toString() : value) });
  assert.equal(storedResponse.status, 201);
  const buyResponse = await fetch(`${base}/v1/listings/buy`, { method: 'POST', headers: { ...headers, 'idempotency-key': 'buy-1' }, body: JSON.stringify({ orderHash: built.orderHash }) });
  assert.equal(buyResponse.status, 201); const buy = await buyResponse.json();
  assert.equal(buy.totalBuyerPayment, '1000000'); assert.equal(buy.prepared.to, policy.seaport); assert.match(buy.prepared.data, /^0x[0-9a-f]+$/i);
});
