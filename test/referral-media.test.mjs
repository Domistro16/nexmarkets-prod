import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareBuilderSettledReferral, qualifyReferral, referralTierForQualifiedSales, serialArtworkCommitment, validateUpload } from '../packages/domain/src/index.mjs';

test('certified referral tiers require explicit threshold policy and remain Builder Settled', () => {
  const policy = { thresholds: [0, 10, 50, 100] };
  assert.equal(referralTierForQualifiedSales(0, policy), 5); assert.equal(referralTierForQualifiedSales(50, policy), 15);
  const settlement = prepareBuilderSettledReferral({ attributionId: 'a', builderAccountId: 'b', grossBasis: 1000n, tierPercent: 20, idempotencyKey: 'x' });
  assert.equal(settlement.amount, 200n); assert.equal(settlement.settlementModel, 'BUILDER_SETTLED');
  assert.throws(() => referralTierForQualifiedSales(1, null), /UNRESOLVED/);
});

test('referral hint is noncanonical and self-referral is rejected', () => {
  const result = qualifyReferral({ referrerAccountId: 'a', referredAccountId: 'b', referralHint: '0xabc', verifiedReferrerWallets: ['0xAbC'] });
  assert.equal(result.hintCanonical, false);
  assert.throws(() => qualifyReferral({ referrerAccountId: 'a', referredAccountId: 'a', referralHint: '0xabc', verifiedReferrerWallets: ['0xabc'] }), /SELF/);
});

test('media validation and serial artwork commitment are deterministic', () => {
  const media = validateUpload({ ownerAccountId: 'a', filename: 'one.png', mimeType: 'image/png', bytes: new Uint8Array([1,2,3]) });
  assert.equal(media.byteSize, 3); assert.throws(() => validateUpload({ ownerAccountId: 'a', filename: 'one.jpg', mimeType: 'image/png', bytes: new Uint8Array([1]) }), /MIME/);
  const commitment = serialArtworkCommitment([{ tokenId: 1, sha256: 'a'.repeat(64) }, { tokenId: 2, sha256: 'b'.repeat(64) }]);
  assert.equal(commitment.length, 64); assert.throws(() => serialArtworkCommitment([{ tokenId: 2, sha256: 'a'.repeat(64) }]));
});
