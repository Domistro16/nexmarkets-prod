import test from 'node:test';
import assert from 'node:assert/strict';
import { TypedDataEncoder } from 'ethers';
import { buildNexMarketsOrder, listingZoneHash, seaportOrderHash, validateNexMarketsOrder } from '../packages/domain/src/index.mjs';

const A = {
  seller: '0x1111111111111111111111111111111111111111',
  edition: '0x2222222222222222222222222222222222222222',
  usdg: '0x3333333333333333333333333333333333333333',
  protocolFeeRecipient: '0x4444444444444444444444444444444444444444',
  royaltyVault: '0x5555555555555555555555555555555555555555',
  zone: '0x6666666666666666666666666666666666666666',
  zoneHash: `0x${'77'.repeat(32)}`,
  tokenId: 1n, price: 1_000_000n, royaltyBps: 500n, startTime: 100n, endTime: 200n,
  currentOwner: '0x1111111111111111111111111111111111111111', now: 99n
};

test('Seaport order charges exact 1% + 5% with no buyer surcharge', () => {
  const { order, amounts } = buildNexMarketsOrder(A);
  assert.deepEqual(amounts, { price: 1_000_000n, protocolFee: 10_000n, royalty: 50_000n, sellerProceeds: 940_000n });
  assert.equal(order.consideration.reduce((sum, item) => sum + item.startAmount, 0n), A.price);
  assert.equal(order.consideration[1].recipient, A.royaltyVault);
  assert.equal(validateNexMarketsOrder(order, A), true);
});

test('zero royalty preserves exact fee and seller remainder', () => {
  const input = { ...A, royaltyBps: 0n };
  const { order, amounts } = buildNexMarketsOrder(input);
  assert.equal(order.consideration.length, 2);
  assert.deepEqual(amounts, { price: 1_000_000n, protocolFee: 10_000n, royalty: 0n, sellerProceeds: 990_000n });
});

test('Builder equal seller never redirects royalty away from Vault', () => {
  const { order } = buildNexMarketsOrder({ ...A, royaltyReceiver: A.seller });
  assert.equal(order.consideration[1].recipient, A.royaltyVault);
  assert.equal(order.consideration[2].recipient, A.seller);
});

for (const [name, mutate] of [
  ['wrong currency', (order) => { order.consideration[0].token = A.edition; }],
  ['wrong fee', (order) => { order.consideration[0].startAmount += 1n; order.consideration[0].endAmount += 1n; }],
  ['wrong royalty', (order) => { order.consideration[1].startAmount -= 1n; order.consideration[1].endAmount -= 1n; }],
  ['wrong seller recipient', (order) => { order.consideration[2].recipient = A.edition; }],
  ['wrong token', (order) => { order.offer[0].identifierOrCriteria = 2n; }],
  ['wrong zoneHash', (order) => { order.zoneHash = `0x${'88'.repeat(32)}`; }],
  ['extra consideration', (order) => { order.consideration.push(structuredClone(order.consideration[0])); }]
]) {
  test(`order validator rejects ${name}`, () => {
    const { order } = buildNexMarketsOrder(A); mutate(order);
    assert.throws(() => validateNexMarketsOrder(order, A));
  });
}

test('order builder rejects expired listing and transferred token', () => {
  assert.throws(() => buildNexMarketsOrder({ ...A, now: 200n }), /expired/);
  assert.throws(() => buildNexMarketsOrder({ ...A, currentOwner: '0x9999999999999999999999999999999999999999' }), /no longer owns/);
});

test('builder derives the Registry zoneHash, Seaport order hash, and createListing calldata deterministically', () => {
  const input = {
    ...A, zoneHash: undefined, counter: 7n,
    termsVersionHash: `0x${'aa'.repeat(32)}`,
    royaltyReceiver: '0x8888888888888888888888888888888888888888',
    listingRegistry: '0x9999999999999999999999999999999999999999'
  };
  const first = buildNexMarketsOrder(input); const second = buildNexMarketsOrder(input);
  assert.equal(first.order.zoneHash, listingZoneHash(input));
  assert.equal(first.orderHash, seaportOrderHash(first.order, 7n));
  const types = {
    OfferItem: [
      { name: 'itemType', type: 'uint8' }, { name: 'token', type: 'address' },
      { name: 'identifierOrCriteria', type: 'uint256' }, { name: 'startAmount', type: 'uint256' }, { name: 'endAmount', type: 'uint256' }
    ],
    ConsiderationItem: [
      { name: 'itemType', type: 'uint8' }, { name: 'token', type: 'address' },
      { name: 'identifierOrCriteria', type: 'uint256' }, { name: 'startAmount', type: 'uint256' },
      { name: 'endAmount', type: 'uint256' }, { name: 'recipient', type: 'address' }
    ],
    OrderComponents: [
      { name: 'offerer', type: 'address' }, { name: 'zone', type: 'address' }, { name: 'offer', type: 'OfferItem[]' },
      { name: 'consideration', type: 'ConsiderationItem[]' }, { name: 'orderType', type: 'uint8' },
      { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }, { name: 'zoneHash', type: 'bytes32' },
      { name: 'salt', type: 'uint256' }, { name: 'conduitKey', type: 'bytes32' }, { name: 'counter', type: 'uint256' }
    ]
  };
  assert.equal(first.orderHash, TypedDataEncoder.hashStruct('OrderComponents', types, { ...first.order, counter: 7n }));
  assert.equal(first.orderHash, second.orderHash);
  assert.equal(first.registryTransaction.to, input.listingRegistry);
  assert.match(first.registryTransaction.data, /^0x[0-9a-f]+$/i);
});

test('builder rejects a zoneHash that does not bind the exact historical Terms listing', () => {
  assert.throws(() => buildNexMarketsOrder({
    ...A, termsVersionHash: `0x${'aa'.repeat(32)}`, royaltyReceiver: '0x8888888888888888888888888888888888888888'
  }), /zoneHash does not match/);
});
