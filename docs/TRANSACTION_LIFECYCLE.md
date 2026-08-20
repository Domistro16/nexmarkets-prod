# Transaction lifecycle

The only success lifecycle is:

`PREPARED → WALLET_PENDING → SUBMITTED → CONFIRMED → FINALIZED`

Recovery/terminal states are `CANCELLED`, `REVERTED` and `REORGED`. A transaction hash proves only submission. API and UI must not display success until confirmation/finality evidence advances state. A reorg may move submitted/confirmed work into `REORGED` for bounded resubmission or terminal handling.

Each mutation uses an account-scoped idempotency key. Mint intent, Terms publish, listing create/cancel, royalty withdrawal, referral settlement and outbox delivery have unique constraints. Transaction jobs use bounded retries and record the last error; notifications cannot change business state.
# Runtime workers

The API may only record `PREPARED → WALLET_PENDING → SUBMITTED` from the user
wallet. `services/worker/src/run-chain-worker.mjs` reads submitted hashes from
Postgres, verifies `eth_getTransactionReceipt`, `from`, `to`, block hash and
confirmation depth, and then records `CONFIRMED → FINALIZED` (or
`REVERTED`/`REORGED`) with idempotent transaction events and outbox
notifications. A hash alone is never success. Bounded retries leave an
evidence trail for recovery.
