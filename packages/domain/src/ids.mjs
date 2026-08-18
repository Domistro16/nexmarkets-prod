import { randomUUID } from 'node:crypto';
const PREFIX = /^[a-z][a-z0-9_]{1,23}$/;
export function newDomainId(prefix) {
  if (!PREFIX.test(prefix)) throw new Error(`Invalid domain id prefix: ${prefix}`);
  return `${prefix}_${randomUUID().replaceAll('-', '')}`;
}
export const ids = Object.freeze({
  account: () => newDomainId('acct'),
  project: () => newDomainId('proj'),
  launch: () => newDomainId('launch'),
  terms: () => newDomainId('terms'),
  mintIntent: () => newDomainId('mint'),
  redemption: () => newDomainId('redeem'),
  chainTx: () => newDomainId('tx'),
  incident: () => newDomainId('incident')
});
