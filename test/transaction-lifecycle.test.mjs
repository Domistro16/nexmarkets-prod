import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTransactionUpdate } from '../packages/domain/src/index.mjs';

test('transaction lifecycle requires receipt and finality evidence and is event-idempotent', () => {
  let tx = { id: '1', state: 'PREPARED', appliedEventIds: [] };
  tx = applyTransactionUpdate(tx, { state: 'WALLET_PENDING', eventId: 'wallet' });
  assert.throws(() => applyTransactionUpdate(tx, { state: 'SUBMITTED', eventId: 'submit' }), /txHash/);
  tx = applyTransactionUpdate(tx, { state: 'SUBMITTED', eventId: 'submit', txHash: '0x1' });
  assert.equal(applyTransactionUpdate(tx, { state: 'SUBMITTED', eventId: 'submit', txHash: '0x1' }), tx);
  assert.throws(() => applyTransactionUpdate(tx, { state: 'CONFIRMED', eventId: 'confirm', txHash: '0x1' }), /receipt/);
  tx = applyTransactionUpdate(tx, { state: 'CONFIRMED', eventId: 'confirm', txHash: '0x1', blockNumber: 10, blockHash: '0x2' });
  tx = applyTransactionUpdate(tx, { state: 'FINALIZED', eventId: 'final', txHash: '0x1', blockNumber: 10, blockHash: '0x2', finalizedAt: 'now' });
  assert.equal(tx.state, 'FINALIZED');
});

test('confirmed transaction can become REORGED but cannot silently finalize afterward', () => {
  const confirmed = { state: 'CONFIRMED', txHash: '0x1', blockNumber: 10, blockHash: '0x2', appliedEventIds: [] };
  const reorged = applyTransactionUpdate(confirmed, { state: 'REORGED', eventId: 'reorg' });
  assert.equal(reorged.state, 'REORGED'); assert.throws(() => applyTransactionUpdate(reorged, { state: 'FINALIZED', eventId: 'bad' }));
});
