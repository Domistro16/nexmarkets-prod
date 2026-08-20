# Worker

`src/run-chain-worker.mjs` is the runnable Robinhood receipt/finality worker. It
advances submitted transaction jobs only from RPC evidence, records
CONFIRMED/FINALIZED/REVERTED/REORGED events idempotently, and emits durable
notification/outbox records. `npm --workspace @nexmarkets/worker run once` runs
one bounded batch; `start` runs the resumable loop. It never treats a tx hash
alone as success and never stores a private key. `npm --workspace
@nexmarkets/worker run outbox` delivers claimed records to the configured
notification webhook with the durable business-key idempotency header.
