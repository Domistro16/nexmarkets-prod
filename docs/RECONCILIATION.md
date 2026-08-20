# Chain reconciliation

Goldsky is a mirror, never authority. `ReconciliationService` compares independent Edition, Pass, Advantage, Listing, RoyaltyVault and TBA entities with RPC chain reads for Edition existence, total minted, `ownerOf`, token Terms, active Terms, Advantage state, listing/direct-transfer status, Vault obligations/withdrawals and ERC-6551 identity. It never forms a SQL Pass×Advantage×Listing×Royalty cross-product; every order hash is reconciled as its own listing/claim item. A deterministic but not-yet-created TBA is not reported as a discrepancy when the projection has no created account.

Discrepancies create immutable run/incident evidence with expected, observed, canonical authority and an explicit repair action. Listing reads come from `NexListingRegistry.listingInfo`, not the Advantage registry; royalty and withdrawal shapes are normalized before comparison. The reconciler does not silently write a conflicting projection as truth. RPC reads use bounded retries; exhaustion produces a report-only incident.

TimeBased/Connected expected values use the same kind-aware semantics as
`NexAdvantageRegistry.remaining`, including per-Advantage listing freezes.
Tests cover duplicate/reordered events, missing events, reorg rebuilding, stale
owners, stale listings and isolated historical royalty claims. Operations
monitor landed/finalized watermark freshness, reconciliation lag, incident
count and retry exhaustion.
# Runnable reconciliation

`services/reconciler/src/run.mjs` wires the existing comparison service to the
Robinhood RPC adapter and PostgreSQL projection/evidence store. It checks
ERC-721 ownership and Terms, Advantage/listing state, Vault claims and TBA
identity, records discrepancies in `reconciliation_run` and
`reconciliation_incident`, retries transient RPC failures with a bound, and
never overwrites chain truth. Schedule it independently from Goldsky and the
chain lifecycle worker.
