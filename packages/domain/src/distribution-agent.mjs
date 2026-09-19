/**
 * Domain rules and pure calculations for Dynamic Server Wallet autonomous reward distributions.
 */

export function calculateRewardSplit({ totalAmount, eligibleSupply }) {
  const total = BigInt(totalAmount ?? 0);
  const supply = BigInt(eligibleSupply ?? 0);

  if (supply <= 0n) throw new Error('ELIGIBLE_SUPPLY_REQUIRED');
  if (total <= 0n) throw new Error('TOTAL_AMOUNT_REQUIRED');

  const amountPerPass = total / supply;
  if (amountPerPass <= 0n) {
    throw new Error('INSUFFICIENT_AMOUNT_PER_PASS');
  }

  const fundedAmount = amountPerPass * supply;
  const dustRemainder = total - fundedAmount;

  return {
    amountPerPass,
    fundedAmount,
    dustRemainder,
    eligibleSupply: Number(supply)
  };
}

export function chunkTokenIds({ eligibleSupply, chunkSize = 150 }) {
  const supply = Number(eligibleSupply);
  if (!Number.isInteger(supply) || supply <= 0) {
    throw new Error('INVALID_ELIGIBLE_SUPPLY');
  }
  const size = Math.max(1, Math.min(Number(chunkSize) || 150, 500));

  const chunks = [];
  let current = [];
  for (let tokenId = 1; tokenId <= supply; tokenId++) {
    current.push(tokenId);
    if (current.length === size) {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

export function calculateBuilderSweep({ totalRoyalty, allocationBps = 3000 }) {
  const total = BigInt(totalRoyalty ?? 0);
  const bps = BigInt(allocationBps);

  if (bps < 0n || bps > 10000n) {
    throw new Error('INVALID_ALLOCATION_BPS');
  }
  if (total < 0n) {
    throw new Error('INVALID_TOTAL_ROYALTY');
  }

  const rewardPool = (total * bps) / 10000n;
  const builderRetained = total - rewardPool;

  return {
    totalRoyalty: total,
    rewardPool,
    builderRetained,
    allocationBps: Number(bps)
  };
}

export function isDistributionDue({ nextDistributionAt, now = new Date() }) {
  if (!nextDistributionAt) return false;
  const dueTime = new Date(nextDistributionAt).getTime();
  const currentTime = new Date(now).getTime();
  return currentTime >= dueTime;
}
