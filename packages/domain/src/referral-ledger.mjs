export const REFERRAL_TIERS = Object.freeze([5, 10, 15, 20]);

export function referralTierForQualifiedSales(qualifiedSales, policy) {
  if (!Number.isInteger(qualifiedSales) || qualifiedSales < 0) throw new Error('qualifiedSales must be non-negative');
  const thresholds = policy?.thresholds;
  if (!Array.isArray(thresholds) || thresholds.length !== 4 || thresholds[0] !== 0) {
    throw new Error('REFERRAL_TIER_THRESHOLDS_UNRESOLVED');
  }
  for (let i = thresholds.length - 1; i >= 0; i -= 1) {
    if (qualifiedSales >= thresholds[i]) return REFERRAL_TIERS[i];
  }
  return REFERRAL_TIERS[0];
}

export function qualifyReferral({ referrerAccountId, referredAccountId, referralHint, verifiedReferrerWallets }) {
  if (!referrerAccountId || !referredAccountId) throw new Error('referral accounts required');
  if (referrerAccountId === referredAccountId) throw new Error('SELF_REFERRAL_REJECTED');
  const hint = referralHint?.toLowerCase();
  if (!hint || !verifiedReferrerWallets.map((value) => value.toLowerCase()).includes(hint)) {
    throw new Error('REFERRAL_HINT_NOT_QUALIFIED');
  }
  return Object.freeze({ qualified: true, authority: 'POSTGRES_REFERRAL_LEDGER', hintCanonical: false });
}

export function prepareBuilderSettledReferral({ attributionId, builderAccountId, grossBasis, tierPercent, idempotencyKey }) {
  if (!REFERRAL_TIERS.includes(tierPercent)) throw new Error('invalid certified referral tier');
  if (!attributionId || !builderAccountId || !idempotencyKey) throw new Error('settlement identity required');
  const basis = BigInt(grossBasis);
  if (basis < 0n) throw new Error('grossBasis must be non-negative');
  return {
    attributionId,
    builderAccountId,
    tierPercent,
    amount: basis * BigInt(tierPercent) / 100n,
    idempotencyKey,
    status: 'PREPARED',
    settlementModel: 'BUILDER_SETTLED'
  };
}
