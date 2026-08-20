# Reconciliation

`src/run.mjs` connects `ReconciliationService` to Robinhood JSON-RPC and the
PostgreSQL projection tables. It compares chain truth for ownership, historical
Terms, Advantages, listings, royalty claims and token-bound accounts, records
bounded-retry evidence in `reconciliation_run`/`reconciliation_incident`, and
never overwrites canonical chain state. Run it as a scheduled job with
`npm --workspace @nexmarkets/reconciler run once`.
