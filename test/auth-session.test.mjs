import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSession, issueSession } from '../packages/auth/src/index.mjs';

test('secure opaque session enforces token, CSRF, expiration and revocation', () => {
  const issued = issueSession({ accountId: 'a', walletId: 'w', now: 1000, ttlSeconds: 60 });
  assert.equal(assertSession(issued.record, issued.token, { now: 2000 }), true);
  assert.equal(assertSession(issued.record, issued.token, { mutation: true, csrfToken: issued.csrfToken, now: 2000 }), true);
  assert.throws(() => assertSession(issued.record, issued.token, { mutation: true, csrfToken: 'wrong', now: 2000 }), /CSRF/);
  assert.throws(() => assertSession(issued.record, issued.token, { now: 61000 }), /SESSION/);
  assert.throws(() => assertSession({ ...issued.record, revokedAt: 2000 }, issued.token, { now: 3000 }), /SESSION/);
});
