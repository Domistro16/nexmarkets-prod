import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRewardSplit,
  chunkTokenIds,
  calculateBuilderSweep,
  isDistributionDue
} from '../packages/domain/src/distribution-agent.mjs';

test('calculateRewardSplit: divides evenly without dust', () => {
  const result = calculateRewardSplit({
    totalAmount: 10_000_000n, // 10 USDC
    eligibleSupply: 100
  });
  assert.equal(result.amountPerPass, 100_000n);
  assert.equal(result.fundedAmount, 10_000_000n);
  assert.equal(result.dustRemainder, 0n);
  assert.equal(result.eligibleSupply, 100);
});

test('calculateRewardSplit: preserves dust remainder for uneven divisions', () => {
  const result = calculateRewardSplit({
    totalAmount: 10_000_075n,
    eligibleSupply: 100
  });
  assert.equal(result.amountPerPass, 100_000n);
  assert.equal(result.fundedAmount, 10_000_000n);
  assert.equal(result.dustRemainder, 75n);
});

test('calculateRewardSplit: works for 2,222 edition supply', () => {
  const total = 500_000_000n; // 500 USDC
  const result = calculateRewardSplit({
    totalAmount: total,
    eligibleSupply: 2222
  });
  assert.equal(result.amountPerPass, 225_022n);
  assert.equal(result.fundedAmount, 225_022n * 2222n);
  assert.equal(result.dustRemainder, total - (225_022n * 2222n));
  assert.equal(result.dustRemainder < 2222n, true);
});

test('calculateRewardSplit: throws on invalid inputs', () => {
  assert.throws(() => calculateRewardSplit({ totalAmount: 0n, eligibleSupply: 100 }), /TOTAL_AMOUNT_REQUIRED/);
  assert.throws(() => calculateRewardSplit({ totalAmount: 1000n, eligibleSupply: 0 }), /ELIGIBLE_SUPPLY_REQUIRED/);
  assert.throws(() => calculateRewardSplit({ totalAmount: 10n, eligibleSupply: 100 }), /INSUFFICIENT_AMOUNT_PER_PASS/);
});

test('chunkTokenIds: chunks sequential token IDs accurately', () => {
  const chunks = chunkTokenIds({ eligibleSupply: 10, chunkSize: 4 });
  assert.deepEqual(chunks, [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10]
  ]);
});

test('chunkTokenIds: handles 2,222 passes with default 150 batch size', () => {
  const chunks = chunkTokenIds({ eligibleSupply: 2222, chunkSize: 150 });
  assert.equal(chunks.length, 15);
  assert.equal(chunks[0].length, 150);
  assert.equal(chunks[0][0], 1);
  assert.equal(chunks[0][149], 150);
  assert.equal(chunks[14].length, 122);
  assert.equal(chunks[14][121], 2222);
});

test('calculateBuilderSweep: splits royalty into reward pool and builder retained', () => {
  const sweep = calculateBuilderSweep({
    totalRoyalty: 10_000_000n, // 10 USDC
    allocationBps: 3000 // 30%
  });
  assert.equal(sweep.rewardPool, 3_000_000n);
  assert.equal(sweep.builderRetained, 7_000_000n);
  assert.equal(sweep.totalRoyalty, 10_000_000n);
});

test('calculateBuilderSweep: handles 0% and 100% allocation boundaries', () => {
  const allToHolder = calculateBuilderSweep({ totalRoyalty: 5000n, allocationBps: 10000 });
  assert.equal(allToHolder.rewardPool, 5000n);
  assert.equal(allToHolder.builderRetained, 0n);

  const allToBuilder = calculateBuilderSweep({ totalRoyalty: 5000n, allocationBps: 0 });
  assert.equal(allToBuilder.rewardPool, 0n);
  assert.equal(allToBuilder.builderRetained, 5000n);
});

test('isDistributionDue: evaluates timestamps correctly', () => {
  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 60_000);
  assert.equal(isDistributionDue({ nextDistributionAt: past }), true);
  assert.equal(isDistributionDue({ nextDistributionAt: future }), false);
});
