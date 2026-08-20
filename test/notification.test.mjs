import test from 'node:test';
import assert from 'node:assert/strict';
import { NOTIFICATION_TYPE, notificationOutbox } from '../packages/domain/src/index.mjs';

test('all V1 lifecycle notification types use deterministic noncanonical outbox identities', () => {
  for (const type of Object.values(NOTIFICATION_TYPE)) {
    const first = notificationOutbox({ type, businessKey: 'chain:tx:0', aggregateType: 'PASS', aggregateId: 'edition:1' });
    const second = notificationOutbox({ type, businessKey: 'chain:tx:0', aggregateType: 'PASS', aggregateId: 'edition:1' });
    assert.equal(first.id, second.id); assert.equal(first.authority, 'NOTIFICATION_ONLY_NONCANONICAL');
  }
  assert.throws(() => notificationOutbox({ type: 'OWNERSHIP_CHANGED', businessKey: 'x', aggregateType: 'x', aggregateId: 'x' }));
});
