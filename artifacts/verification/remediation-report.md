# NEXMARKETS Remediation Report

Date: 2026-09-08

## Certification status

**BLOCKED — production migration is not verified.**

The authority, accounting, database migration, API read model, configuration, quality, and browser regressions were repaired and rechecked. Certification remains open because the supplied chain lifecycle has no change-ask/replacement-order transaction, a fresh end-to-end chain journey has not been executed, and the original independent certification prompt has not returned `PRODUCTION MIGRATION VERIFIED`.

## Original findings, root causes, and repairs

The five source verification artifacts were read before changes. The traceable finding matrix is in [remediation-table.md](./remediation-table.md).

| Finding | Root cause | Repair / current state |
|---|---|---|
| Production-reachable fixtures | The static visual shell initialized demo authorities before the API adapter. | Production seed collections now resolve empty unless `__NEXMARKETS_FIXTURE_MODE__ === true`; live routes fail closed without backend records. |
| localStorage domain authority | The template persisted profile and runtime domain state in browser storage. | Domain state is backend/indexer/chain-owned. Remaining browser state is ephemeral or cosmetic UI selection; authority and fresh-session tests pass. |
| Competing Pass renderers | Legacy/demo/native branches could independently choose current design fields. | Frozen canonical Pass configuration plus explicit renderer-version compatibility boundary; current Editions use the canonical renderer and export consumes that configuration. |
| Zero primary proceeds | Dashboard values had zero fallbacks and no primary settlement projection. | Confirmed `PrimaryMintSettled` events are idempotently projected into accounting with gross, 5% fee, Builder proceeds, referral obligation, token, network, tx, block, edition and buyer data. |
| Single Builder identity | Historical schema made `builder_profile.account_id` unique. | Added persistent `builder` and `builder_membership` relationships, preserved historical Builder IDs, and scoped Products, projects, dashboard and mutations by authorized `builderId`. |
| Unverified PostgreSQL migration | The pooler credential failed and the verifier originally required database-creation privileges. | Migrations now prefer `DIRECT_URL`; 0001–0009 were applied to the configured PostgreSQL 17.6 database. The verifier uses an isolated schema and passed all preservation/integrity checks. |
| Six skipped Node tests | Six integration/reorg tests require a PostgreSQL connection. | Added an isolated-schema test runner. All 131 Node tests now execute and pass with zero skips. |
| Missing live-chain certification | Browser evidence used a harness; no new live transaction was submitted. | Existing real receipts, events, RPC and Goldsky state were re-read, and the local API now corroborates the exact Pass. Replacement-order evidence remains unavailable. |
| MockUSDG ambiguity | Testnet token was presented without chain-scoped production semantics. | Robinhood testnet explicitly displays MockUSDG and is marked testnet-only; mainnet configuration uses real USDG and production readiness requires separate token verification. |
| Manual `productionReady` | Readiness was a literal config boolean. | Readiness is derived from six explicit gates and remains false while any gate is false. |
| Missing quality evidence | Existing visual evidence did not include complete performance, accessibility or negative-security checks. | Added runnable audits and reports; serious accessibility violations are zero and all negative-security cases pass. |
| Incomplete human journey/recertification | Existing browser flow did not prove the real external-authority journey. | Browser regression suite is green and evidence artifacts are present, but the real API-backed/chain-backed human journey and independent recertification remain open. |

## Implementation and schema changes

- Authority boundaries and fixture/storage/renderer maps: `authority-boundary.md`, `storage-authority-map.md`, `renderer-map.md`.
- Canonical design, rendering, and accounting: `packages/domain/src/pass-design.mjs`, `packages/domain/src/pass-renderer.mjs`, `packages/domain/src/primary-accounting.mjs`, `packages/domain/src/launch-draft.mjs`.
- Builder relationships and accounting persistence: `infra/schema/0008_builder_identities_and_primary_accounting.sql`, `infra/schema/0009_multi_builder_secondary_relationships.sql`, `packages/data/src/postgres-store.mjs`, `apps/api/src/memory-store.mjs`, `apps/api/src/server.mjs`.
- Indexer settlement projection and duplicate-event conflict protection: `services/indexer/src/runtime.mjs`.
- Chain-scoped token and readiness configuration: `packages/config/src/networks.mjs`, `packages/config/src/production-readiness.mjs`, `.env.example`, `scripts/render-web-testnet-config.mjs`, `scripts/render-web-config.mjs`.
- Verification and CI: `scripts/verify-database-migration.mjs`, `scripts/verify-testnet-certification.mjs`, `.github/workflows/ci.yml`, and the performance/accessibility/security audit scripts.
- Direct database test execution: `scripts/run-postgres-tests.mjs`; migration commands prefer `DIRECT_URL`, while the local testnet server maps its API database connection to the direct endpoint.

## Gate results

| Gate | Result | Evidence |
|---|---|---|
| 1 — authority convergence | PASS | Fixture, storage-authority, renderer, and production-mode authority checks; no production `localStorage.` authority in the approved shell. |
| 2 — domain correctness | PASS | Primary accounting, duplicate-event, referral, multi-Builder isolation, and database-backed tests pass. |
| 3 — persistence | PASS | Migrations 0001–0009 were applied; [database-migration-report.md](./database-migration-report.md) records preserved counts/IDs/values and zero integrity violations. |
| 4 — blockchain | BLOCKED | Actual receipts/events/RPC/Goldsky/API checks pass; change-ask/replacement-order evidence remains `NOT_PROVEN`. |
| 5 — production quality | PASS | Performance and accessibility reports; security negative tests 16/16. |
| 6 — complete E2E | BLOCKED for certification | Rebuilt browser acceptance is 24/24 and API corroboration passes, but no fresh complete chain journey or change-ask transaction was executed. |
| 7 — independent recertification | NOT RUN / NOT PASSED | The required phrase has not been legitimately produced. |

## Test counts

- Node with PostgreSQL: 131 passed, 0 skipped, 0 failed.
- API: 34/34.
- Web: 10/10.
- Subgraph: 2/2.
- Playwright: 24/24.
- Authority convergence: 2/2.
- Security negative suite: 16/16.

The six tests skipped in the failed verification are individually named in [skipped-node-tests.md](./skipped-node-tests.md). All six now execute and pass in the isolated PostgreSQL run.

## Database migration proof

- Target migration runner applied 0001–0009 successfully through the configured direct endpoint.
- PostgreSQL version: 17.6.
- Representative counts were preserved: users 2→2, wallets 2→2, projects 2→2, editions 2→2, terms 2→2, passes 3→3, advantages 1→1, listings 1→1, activity 1→1, and questions 1→1.
- Builders and owner memberships were correctly backfilled 0→2; all representative IDs and values passed.
- Orphan, missing-membership, duplicate-profile and duplicate-Pass checks all returned zero.

## Testnet evidence

Network: Robinhood testnet, chain 46630. The validator re-read 10 actual receipts; it did not submit or fabricate a transaction.

| Operation | Transaction hash | Block |
|---|---|---:|
| Edition creation | `0x9fd60dad38ceb837bcd4bb555259e379c8e7f32b942061b9cf42871933614eef` | 104613585 |
| Terms publication | `0xaed51787c2b1c9eaebd41bfaa27de3491b21205accac501dd3e978b4f7d68ad6` | 104614340 |
| Primary acquisition | `0x969afbdc1e816dc739a526d4b796e7e5cd27a72ccddc2626a8a0ec28fe35b9b5` | 105178318 |
| Listing create | `0xb1d99497379783bb58a527672a20b4f48a6b01598504794890e7e24ce7c46cc6` | 105193461 |
| Cancellation | `0x29841f618a4e4f97d6bdfe871d600be3a2e3e2abe643426839c26af8c2c22e99` | 105193511 |
| Relist | `0x4f8ef729441e78c9a500d96d5ac337be81f279520c7b633d4c1b38c430286ac9` | 105193592 |
| Secondary purchase | `0x59e83d2850f0645eda890bb8938bf9ebd4d484221d54141674beab01a6b2ea5f` | 105194936 |
| Stale listing create | `0xf9de22a65769bd23f7ebe2ed15a754ff8bc856862fe11f964dfb6185077dd8a6` | 105195027 |
| Stale owner transfer | `0x44d3e7b8f0d0dfe326d8561d29c24728306c08fbd72578a29dfebfbbb74497d5` | 105195080 |
| Stale listing sync | `0x6633307c0ef61a3a70be4df31b83008d1b1481eebe6b4fe0df41faa3c6a7afbd` | 105195113 |

Observed primary settlement: 1,000,000 MockUSDG gross, 50,000 fee, 950,000 Builder proceeds; serial 1. Secondary evidence records seller `0xD83deFbA240568040b39bb2C8B4DB7dB02d40593`, buyer `0x679BE0465c097BABEafC116e4dcaA968Ff356eEa`, ask 2,000,000 MockUSDG, and Builder royalty 60,000 MockUSDG. Full state checks are in [testnet-certification.md](./testnet-certification.md).

## Quality results

- Performance: PASS. Fresh route measurements cover Home, Discover, launch detail, Market, Builder profile, Dashboard and Create; public surfaces loaded 182,269 initial JS bytes across 4 requests, zero images/iframes, CLS remained below 0.062, and isolated canonical Pack render mounted in 181 ms. Full data is in [performance-report.md](./performance-report.md).
- Accessibility: PASS for critical/serious criteria. 14 route/viewport checks, 0 unlabeled controls, 0 missing alt text, 0 hidden focusables, 14/14 keyboard passes, and 0 serious violations. Warnings are recorded in [accessibility-report.md](./accessibility-report.md).
- Security: PASS for 16 executable negative tests, including unauthorized/other-Builder edits, tampering, wrong serial, listing ownership, stale listing, Q&A ownership, signature/nonce/session/chain checks and duplicate submission. Chain-delegated wrong-Edition mint and listed-Advantage cases remain documented as prepare-boundary checks in [security-report.md](./security-report.md).

## Remaining blockers

1. Execute and record an actual change-ask/replacement-order transaction on the intended testnet, if required by the contract architecture.
2. Execute the fresh complete funded-wallet human journey against the migrated API/database and chain.
3. Run the original independent certification prompt after that evidence exists.

`productionReady` remains derived and false. It was not manually changed. Therefore this remediation does not claim `PRODUCTION MIGRATION VERIFIED`.
