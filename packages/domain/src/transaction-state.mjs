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
