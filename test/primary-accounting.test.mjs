import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePrimarySales, calculatePrimarySale, PRIMARY_FEE_BPS } from '@nexmarkets/domain';
import { MemoryStore } from '../apps/api/src/memory-store.mjs';

const common = {
  chainId: 46630,
  network: 'robinhood-testnet',
  paymentToken: '0x6A4F8832c23C51ba626Eba9d50c8F862647C1679',
  editionId: 'ed_1',
  editionAddress: '0x1111111111111111111111111111111111111111',
  builderId: 'bld_1',
  buyerAddress: '0x2222222222222222222222222222222222222222',
  recipientAddress: '0x2222222222222222222222222222222222222222',
  blockNumber: 100,
  eventIndex: 4
};

test('primary accounting applies the configured 5% fee to one sale', () => {
  const sale = calculatePrimarySale({ ...common, txHash: `0x${'11'.repeat(32)}`, grossAmountUsdg: '10000000' });
  assert.equal(PRIMARY_FEE_BPS, 500n);
  assert.equal(sale.grossAmountUsdg, '10000000');
  assert.equal(sale.nexmarketsFeeUsdg, '500000');
  assert.equal(sale.builderProceedsUsdg, '9500000');
});

test('primary accounting aggregates confirmed sales, excludes failures, and deduplicates event identity', async () => {
  const store = new MemoryStore();
  const first = await store.recordPrimarySale({ ...common, txHash: `0x${'22'.repeat(32)}`, eventIndex: 0, grossAmountUsdg: '10000000', quantity: 1 });
  const duplicate = await store.recordPrimarySale({ ...common, txHash: `0x${'22'.repeat(32)}`, eventIndex: 0, grossAmountUsdg: '10000000', quantity: 1 });
  assert.deepEqual(duplicate, first);
  await assert.rejects(() => store.recordPrimarySale({ ...common, txHash: `0x${'22'.repeat(32)}`, eventIndex: 0, grossAmountUsdg: '11000000', quantity: 1 }), /PRIMARY_SALE_EVENT_CONFLICT/);
  await store.recordPrimarySale({ ...common, txHash: `0x${'33'.repeat(32)}`, eventIndex: 1, grossAmountUsdg: '20000000', quantity: 2 });
  await store.recordPrimarySale({ ...common, txHash: `0x${'44'.repeat(32)}`, eventIndex: 2, grossAmountUsdg: '5000000', quantity: 1, status: 'FAILED' });
  const rows = await store.primarySalesForBuilder('bld_1');
  const total = aggregatePrimarySales(rows);
  assert.equal(total.salesCount, 2);
  assert.equal(total.unitsSold, 3);
  assert.equal(total.grossAmountUsdg, '30000000');
  assert.equal(total.nexmarketsFeeUsdg, '1500000');
  assert.equal(total.builderProceedsUsdg, '28500000');
});

test('referral obligation is recorded separately from Builder proceeds', () => {
  const sale = calculatePrimarySale({ ...common, txHash: `0x${'55'.repeat(32)}`, grossAmountUsdg: '10000000', referralObligationUsdg: '1500000' });
  assert.equal(sale.nexmarketsFeeUsdg, '500000');
  assert.equal(sale.builderProceedsUsdg, '9500000');
  assert.equal(sale.referralObligationUsdg, '1500000');
});
