export const TX_STEPS = Object.freeze(['PREPARED','WALLET_PENDING','SUBMITTED','CONFIRMED','FINALIZED']);
export const TX_TERMINAL = Object.freeze(['CANCELLED','REVERTED','REORGED']);
export function transactionProgress(state) { const index = TX_STEPS.indexOf(state); return { state, completed: index < 0 ? 0 : index + 1, terminal: TX_TERMINAL.includes(state), final: state === 'FINALIZED' }; }
