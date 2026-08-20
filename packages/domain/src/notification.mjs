import { createHash } from 'node:crypto';

export const NOTIFICATION_TYPE = Object.freeze({
  PREVIEW_STARTED: 'PREVIEW_STARTED', MINT_OPENED: 'MINT_OPENED', MINT_FINALIZED: 'MINT_FINALIZED',
  PASS_SOLD: 'PASS_SOLD', LISTING_CANCELLED: 'LISTING_CANCELLED', LISTING_EXPIRED: 'LISTING_EXPIRED',
  LISTING_STALE: 'LISTING_STALE', ADVANTAGE_USED: 'ADVANTAGE_USED', ROYALTY_WITHDRAWABLE: 'ROYALTY_WITHDRAWABLE',
  ROYALTY_WITHDRAWN: 'ROYALTY_WITHDRAWN', REFERRAL_QUALIFIED: 'REFERRAL_QUALIFIED', REFERRAL_SETTLED: 'REFERRAL_SETTLED'
});

export function notificationOutbox({ type, businessKey, aggregateType, aggregateId, accountId = null, payload = {} }) {
  if (!Object.values(NOTIFICATION_TYPE).includes(type)) throw new Error('unsupported notification type');
  if (!businessKey || !aggregateType || !aggregateId) throw new Error('notification identity required');
  return Object.freeze({
    id: `out_${createHash('sha256').update(`${type}:${businessKey}`).digest('hex').slice(0, 24)}`,
    type, businessKey, aggregateType, aggregateId, accountId, payload,
    authority: 'NOTIFICATION_ONLY_NONCANONICAL'
  });
}
