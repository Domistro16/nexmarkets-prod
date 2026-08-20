import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function issueSession({ accountId, walletId, ttlSeconds = 60 * 60 * 24 * 7, now = Date.now() }) {
  if (!accountId || !walletId) throw new Error('session identity required');
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  return {
    record: {
      id: `ses_${randomBytes(16).toString('hex')}`,
      accountId,
      walletId,
      tokenHash: hash(token),
      csrfHash: hash(csrfToken),
      expiresAt: now + ttlSeconds * 1000,
      revokedAt: null
    },
    token,
    csrfToken
  };
}

export function assertSession(session, token, { csrfToken, mutation = false, now = Date.now() } = {}) {
  if (!session || session.revokedAt || now >= session.expiresAt) throw new Error('SESSION_INVALID');
  const expected = Buffer.from(session.tokenHash, 'hex');
  const actual = Buffer.from(hash(token), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('SESSION_INVALID');
  if (mutation) {
    const expectedCsrf = Buffer.from(session.csrfHash, 'hex');
    const actualCsrf = Buffer.from(hash(csrfToken ?? ''), 'hex');
    if (expectedCsrf.length !== actualCsrf.length || !timingSafeEqual(expectedCsrf, actualCsrf)) throw new Error('CSRF_INVALID');
  }
  return true;
}

export function sessionCookie(token, { secure = true, maxAge = 604800 } = {}) {
  return `nexmarkets_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
