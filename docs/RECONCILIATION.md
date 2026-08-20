# Chain reconciliation

Goldsky is a mirror, never authority. `ReconciliationService` compares projected objects with RPC chain reads for Edition existence, total minted, `ownerOf`, token Terms, active Terms, Advantage state, listing/direct-transfer status, Vault obligations/withdrawals and ERC-6551 identity.

Discrepancies create immutable run/incident evidence with expected, observed, canonical authority and an explicit repair action. The reconciler does not silently write a conflicting projection as truth. RPC reads use bounded retries; exhaustion produces a report-only incident.

Tests cover duplicate/reordered events, missing events, reorg rebuilding, stale owners and stale listings. Operations monitor latest finalized/indexed blocks, reconciliation lag, incident count and retry exhaustion.
