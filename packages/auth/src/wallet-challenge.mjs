import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getAddress, verifyMessage } from 'ethers';

export function issueWalletChallenge({ accountId, address, origin, chainId = 4663, ttlSeconds = 300, now = Date.now() }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Invalid EVM address');
  if (!origin) throw new Error('origin required');
  if (![4663, 46630].includes(chainId)) throw new Error('Robinhood chain required');
  const url = new URL(origin);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('secure origin required');
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = now + ttlSeconds * 1000;
  const message = [
    `${url.host} wants you to sign in with your Ethereum account:`,
    getAddress(address),
    '',
    'Sign in to NexMarkets. This request does not submit a transaction.',
    '',
    `URI: ${url.origin}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(expiresAt).toISOString()}`,
    `Request ID: ${accountId}`
  ].join('\n');
  return { accountId, address: getAddress(address).toLowerCase(), nonce, origin: url.origin, domain: url.host, chainId, message, issuedAt: now, expiresAt, consumedAt: null };
}

export function assertChallengeUsable(challenge, { accountId, address, origin, chainId = challenge.chainId, now = Date.now() }) {
  if (challenge.consumedAt) throw new Error('Wallet challenge already consumed');
  if (now > challenge.expiresAt) throw new Error('Wallet challenge expired');
  if (challenge.accountId !== accountId) throw new Error('Wallet challenge account mismatch');
  if (challenge.origin !== new URL(origin).origin) throw new Error('Wallet challenge origin mismatch');
  if (challenge.chainId !== chainId) throw new Error('Wallet challenge chain mismatch');
  const a = Buffer.from(challenge.address);
  const b = Buffer.from(address.toLowerCase());
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Wallet challenge address mismatch');
  return true;
}

export function verifyWalletChallengeSignature(challenge, signature) {
  if (typeof signature !== 'string' || !signature.startsWith('0x')) throw new Error('signature required');
  const recovered = verifyMessage(challenge.message, signature).toLowerCase();
  if (recovered !== challenge.address) throw new Error('Wallet signature mismatch');
  return recovered;
}

export function consumeChallenge(challenge, now = Date.now()) {
  if (challenge.consumedAt) throw new Error('Wallet challenge already consumed');
  return { ...challenge, consumedAt: now };
}
