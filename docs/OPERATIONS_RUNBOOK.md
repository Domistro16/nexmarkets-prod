# Operations runbook

Monitor API request/error rates, PostgreSQL readiness, transaction failures by lifecycle state, Goldsky latest indexed/finalized block, indexer lag, orphaned events, reconciliation lag/incidents and outbox delivery/retry/dead-letter counts. Logs are structured with request/correlation/intent IDs and must not include signatures, session/CSRF tokens, private keys, database credentials or Goldsky secrets.

On Goldsky lag, keep reads labelled as projections and pause time-sensitive preparation if the reconciler cannot confirm chain truth. On reorg, mark affected events/projections orphaned, rebuild in canonical order and move affected transactions to `REORGED`. On outbox failure, retry with the same business key; never duplicate the underlying event.

On contract mismatch or Safe policy failure, abort deployment. On Vault reconciliation mismatch, stop secondary preparation and compare Seaport fulfillment/Vault balances and claims. Never bypass the 30-day hold or redirect a claim.
