# PostgreSQL handoff state

No database command, migration, seed, or write was run for this handoff.

## Technology

- Database: PostgreSQL (server version was not recorded by the available
  verification artifacts).
- Node client dependency: `pg` `8.16.3` (root `package.json`).
- Application store: `packages/data/src/postgres-store.mjs` (`PostgresStore`).

## Migrations

Migration files present under `infra/schema/`:

1. `0001_phase0_authority.sql`
2. `0002_nexmarkets_v1.sql`
3. `0003_social_and_builder_profiles.sql`
4. `0004_multi_network_chain_ids.sql`
5. `0005_permissionless_editions.sql`
6. `0006_builder_questions.sql`
7. `0007_media_upload_verification.sql`
8. `0008_builder_identities_and_primary_accounting.sql`
9. `0009_multi_builder_secondary_relationships.sql`

Latest migration number: **0009**. The existing migration verification artifact
reports all nine applied in its clean ephemeral verification schema and reports
`PASS` for ID preservation and integrity. That run is documented in
`artifacts/verification/database-migration-report.md`; it did not mutate the
production database.

## Representative counts from the last safe verification

These are the before/after counts from the migration report's isolated schema,
not a new live query at handoff time:

| Entity | Before | After |
|---|---:|---:|
| users | 2 | 2 |
| wallets | 2 | 2 |
| projects | 2 | 2 |
| editions | 2 | 2 |
| terms | 2 | 2 |
| passes | 3 | 3 |
| advantages | 1 | 1 |
| advantage definitions | 1 | 1 |
| listings | 1 | 1 |
| activity | 1 | 1 |
| questions | 1 | 1 |
| media | 0 | 0 |
| referral settlements | 0 | 0 |
| builders | n/a | 2 |
| builder memberships | n/a | 2 |
| primary sale accounting | n/a | 0 |

The live certification run subsequently created/updated PostgreSQL-backed
Builder social records (profile, updates, questions and an answer). Their exact
IDs are captured in the API output summarized in
`artifacts/handoff/CURRENT_STATE.md`; the old isolated migration counts should
not be interpreted as current production totals.

## Schema status and API connectivity

- Schema verification: **PASS** (41 required tables reported by
  `scripts/verify-schema.mjs`; nine migrations present).
- Migration preservation/integrity: **PASS** in the recorded verification.
- Current API store: PostgreSQL-backed. Authenticated Builder profile/update/
  question/answer requests returned HTTP 200/201 against the local API during
  the final run, proving the configured API could connect and persist state.
- No database passwords, URLs, or credentials are included in this handoff.
