# Chain reconciliation

Goldsky is a mirror, never authority. `ReconciliationService` compares projected objects with RPC chain reads for Edition existence, total minted, `ownerOf`, token Terms, active Terms, Advantage state, listing/direct-transfer status, Vault obligations/withdrawals and ERC-6551 identity.

Discrepancies create immutable run/incident evidence with expected, observed, canonical authority and an explicit repair action. The reconciler does not silently write a conflicting projection as truth. RPC reads use bounded retries; exhaustion produces a report-only incident.

Tests cover duplicate/reordered events, missing events, reorg rebuilding, stale owners and stale listings. Operations monitor latest finalized/indexed blocks, reconciliation lag, incident count and retry exhaustion.
# Runnable reconciliation

`services/reconciler/src/run.mjs` wires the existing comparison service to the
Robinhood RPC adapter and PostgreSQL projection/evidence store. It checks
ERC-721 ownership and Terms, Advantage/listing state, Vault claims and TBA
identity, records discrepancies in `reconciliation_run` and
`reconciliation_incident`, retries transient RPC failures with a bound, and
never overwrites chain truth. Schedule it independently from Goldsky and the
chain lifecycle worker.
