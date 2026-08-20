import { PostgresStore } from '../../../packages/data/src/postgres-store.mjs';
import { OutboxWorker } from './outbox-worker.mjs';

const store = new PostgresStore();
const endpoint = process.env.NOTIFICATION_WEBHOOK_URL;
const deliver = async (event, { idempotencyKey }) => {
  if (!endpoint) throw new Error('NOTIFICATION_DELIVERY_ENDPOINT_REQUIRED');
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify({ type: event.eventType, businessKey: event.businessKey, payload: event.payload }) });
  if (!response.ok) throw new Error(`NOTIFICATION_DELIVERY_HTTP_${response.status}`);
};
const worker = new OutboxWorker({ repository: store, deliver });
try { console.log(JSON.stringify({ event: 'outbox_batch', ...(await worker.runBatch(Number(process.env.OUTBOX_BATCH_SIZE ?? 50))) })); } finally { await store.close(); }
