# Reconciliation

`src/run.mjs` connects `ReconciliationService` to Robinhood JSON-RPC and the
Goldsky Subgraph when `NEXMARKETS_SUBGRAPH_URL` is configured. It compares
independent Edition, Pass, Advantage, listing, royalty-claim and token-bound
account entities against chain truth, records bounded-retry evidence in
`reconciliation_run`/`reconciliation_incident`, and never overwrites canonical
state. PostgreSQL remains the evidence/application store. The deprecated Turbo
projection adapter is retained only as a rollback fallback. Subgraph `_meta`
is the indexing progress watermark; the latest protocol event is not. Run it
as a scheduled job with `npm --workspace @nexmarkets/reconciler run once`.
