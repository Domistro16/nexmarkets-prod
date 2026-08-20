import test from 'node:test';
import assert from 'node:assert/strict';
import { OutboxWorker } from '../services/worker/src/outbox-worker.mjs';

test('outbox delivery is idempotently keyed and marks durable completion', async () => {
  const rows = [{ id: '1', eventType: 'MINT_FINALIZED', businessKey: 'tx:1', attempt: 0 }]; const delivered = [];
  const repository = { async claimOutbox() { return rows.filter((row) => !row.deliveredAt); }, async markOutboxDelivered(id) { rows.find((row) => row.id === id).deliveredAt = new Date(); }, async markOutboxFailed() {} };
  const worker = new OutboxWorker({ repository, async deliver(event, context) { delivered.push(context.idempotencyKey); } });
  assert.deepEqual(await worker.runBatch(), { claimed: 1, delivered: 1, retried: 0, dead: 0 });
  assert.equal((await worker.runBatch()).delivered, 0); assert.deepEqual(delivered, ['MINT_FINALIZED:tx:1']);
});

test('outbox failure uses bounded exponential retry and dead-letter state', async () => {
  const row = { id: '1', eventType: 'ROYALTY_UNLOCKED', businessKey: 'claim:1', attempt: 1 }; let failure;
  const repository = { async claimOutbox() { return [row]; }, async markOutboxDelivered() {}, async markOutboxFailed(id, value) { failure = { id, ...value }; } };
  const worker = new OutboxWorker({ repository, maxAttempts: 2, async deliver() { throw new Error('provider down'); } });
  const result = await worker.runBatch(); assert.equal(result.dead, 1); assert.equal(failure.dead, true);
});
