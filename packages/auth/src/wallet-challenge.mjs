import { randomBytes, timingSafeEqual } from 'node:crypto';

export function issueWalletChallenge({ accountId, address, origin, ttlSeconds = 300, now = Date.now() }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid EVM address');
  if (!origin) throw new Error('origin required');
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = now + ttlSeconds * 1000;
  const message = [
    'NexMarkets wallet verification',
    `Origin: ${origin}`,
    `Account: ${accountId}`,
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`
  ].join('\n');
  return { accountId, address: address.toLowerCase(), nonce, origin, message, issuedAt: now, expiresAt, consumedAt: null };
}

export function assertChallengeUsable(challenge, { accountId, address, origin, now = Date.now() }) {
  if (challenge.consumedAt) throw new Error('Wallet challenge already consumed');
  if (now > challenge.expiresAt) throw new Error('Wallet challenge expired');
  if (challenge.accountId !== accountId) throw new Error('Wallet challenge account mismatch');
  if (challenge.origin !== origin) throw new Error('Wallet challenge origin mismatch');
  const a = Buffer.from(challenge.address);
  const b = Buffer.from(address.toLowerCase());
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Wallet challenge address mismatch');
  return true;
}

export function consumeChallenge(challenge, now = Date.now()) {
  if (challenge.consumedAt) throw new Error('Wallet challenge already consumed');
  return { ...challenge, consumedAt: now };
}
