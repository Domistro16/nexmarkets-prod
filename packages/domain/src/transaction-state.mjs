export const TX_STATE = Object.freeze({
  PREPARED: 'PREPARED', WALLET_PENDING: 'WALLET_PENDING', SUBMITTED: 'SUBMITTED',
  CONFIRMED: 'CONFIRMED', FINALIZED: 'FINALIZED', CANCELLED: 'CANCELLED',
  REVERTED: 'REVERTED', REORGED: 'REORGED'
});
const NEXT = Object.freeze({
  PREPARED: new Set(['WALLET_PENDING','CANCELLED']),
  WALLET_PENDING: new Set(['SUBMITTED','CANCELLED']),
  SUBMITTED: new Set(['CONFIRMED','REVERTED','REORGED']),
  CONFIRMED: new Set(['FINALIZED','REORGED']),
  REORGED: new Set(['SUBMITTED','REVERTED','CANCELLED']),
  FINALIZED: new Set(), CANCELLED: new Set(), REVERTED: new Set()
});
export function transitionTransaction(from, to) {
  if (!NEXT[from]?.has(to)) throw new Error(`Invalid transaction transition ${from} -> ${to}`);
  return to;
}
export function isTransactionTerminal(state) { return NEXT[state]?.size === 0; }

export function applyTransactionUpdate(transaction, update) {
  if (!transaction?.state || !update?.state) throw new Error('transaction state required');
  if (!update.eventId) throw new Error('transaction eventId required');
  const applied = new Set(transaction.appliedEventIds ?? []);
  if (applied.has(update.eventId)) return transaction;
  if (update.state === transaction.state) throw new Error('same-state update requires the original eventId');
  transitionTransaction(transaction.state, update.state);
  if (update.state === TX_STATE.SUBMITTED && !update.txHash) throw new Error('SUBMITTED requires txHash');
  if ([TX_STATE.CONFIRMED, TX_STATE.FINALIZED].includes(update.state) && (!update.txHash || update.blockNumber === undefined || !update.blockHash)) throw new Error(`${update.state} requires receipt evidence`);
  if (update.state === TX_STATE.FINALIZED && !update.finalizedAt) throw new Error('FINALIZED requires finality evidence');
  applied.add(update.eventId);
  return { ...transaction, ...update, appliedEventIds: [...applied] };
}
