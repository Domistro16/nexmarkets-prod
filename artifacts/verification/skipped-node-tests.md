# Formerly skipped Node tests

The six tests skipped in the failed verification are all PostgreSQL-backed integration tests. They are not production exemptions. All six were executed against an isolated migrated PostgreSQL 17 schema and passed.

| Test | Reason skipped locally | Production relevance | Dependency / execution condition |
|---|---|---|---|
| `test/runtime-integration.test.mjs:30` — Postgres Goldsky raw log projects Edition and advances checkpoint | `DATABASE_URL` is absent | Production-critical indexer landing and projection | Runs when `DATABASE_URL` is set |
| `test/runtime-integration.test.mjs:65` — Goldsky landed watermark remains progress when the protocol has no recent events | `DATABASE_URL` is absent | Production-critical freshness/readiness behavior | Runs when `DATABASE_URL` is set |
| `test/reconciliation.test.mjs:109` — Postgres reconciliation adapter reads projection rows and records evidence | `DATABASE_URL` is absent | Production-critical reconciliation persistence | Runs when `DATABASE_URL` is set |
| `test/reconciliation.test.mjs:118` — Postgres Advantage projections expose TimeBased, Connected and quantity semantics independently | `DATABASE_URL` is absent | Production-critical Advantage projection semantics | Runs when `DATABASE_URL` is set |
| `test/chain-worker-integration.test.mjs:6` — Postgres chain worker confirms/finalizes and records idempotent evidence | `DATABASE_URL` is absent | Production-critical transaction lifecycle persistence | Runs when `DATABASE_URL` is set |
| `test/indexer-postgres-reorg.integration.test.mjs:28` — Postgres projector routes context-free events and restores canonical state after reorgs | `DATABASE_URL` is absent | Production-critical reorg safety | Runs when `DATABASE_URL` is set |

## Current execution evidence

- Database-backed local run: `node --env-file=.env scripts/run-postgres-tests.mjs` — **131 passed, 0 skipped, 0 failed**. The runner creates a temporary schema, applies all nine migrations, injects its scoped connection into the tests, and drops the schema afterward.
- The direct PostgreSQL endpoint reported PostgreSQL 17.6. The stale transaction-pooler credential was not used for migration or test execution.
- CI contract: `.github/workflows/ci.yml` provisions PostgreSQL 17, runs `npm run db:migrate`, then runs `npm run verify:database:migration` and the complete Node suite with `DATABASE_URL` set.
- A CI run with any of these six tests skipped is a certification failure; the PostgreSQL migration and integration job must report all six as executed and passing.
