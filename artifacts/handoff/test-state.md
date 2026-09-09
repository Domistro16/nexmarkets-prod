# Test state at freeze

This is a record of the latest already-run checks. No new test cycle was
started after the freeze instruction.

| Area | Latest result | Evidence / qualification |
|---|---|---|
| Node/application/domain | **127 pass, 0 fail, 6 skipped / 133 total** | `cmd /c npm test`; latest complete run after the final API discovery fix and before the freeze |
| API | Included in the Node suite; targeted API/social/edition-link tests passed | One earlier full browser-backed live API run exposed and then fixed a nonexistent `builder_profile.handle` SQL reference |
| Web/unit | Included in the Node suite; web/runtime tests pass | `test/web*.test.mjs`, runtime and authority tests are part of the 133 |
| PostgreSQL migration | **PASS** | `scripts/verify-database-migration.mjs` with the configured environment; ephemeral schema, nine migrations, IDs and integrity preserved |
| PostgreSQL harness | **Not a clean complete pass** | One Base selection assertion expected an empty read while the real Goldsky endpoint returned live data; child suite later hung during teardown. No production data was changed by the verifier |
| Subgraph unit tests | **2 pass, 0 fail** | `npm run subgraph:test` |
| Subgraph build | **PASS** | `npm run subgraph:build` after the repository's `--skip-migrations` build-script change |
| Base runtime inspection | **PASS** | RPC-only bytecode/interface/wiring/USDC check: chain `84532`, block `46604093`, direct permissionless Factory supported, signer had gas and USDC |
| Base readiness | **HTTP 200** | Local Base harness `/readyz`: PostgreSQL ok, RPC ok, Goldsky provider, zero lag at recorded probe; `productionReady` remained false |
| Authority checksum | **Mechanical self-consistency only** | `node scripts/verify-product-authority.mjs` passed against the Codex-modified repository copy and manifest (`34bac0e30e66e2d0f675d71d2a22033e6b176b3351320bc1e5b97212d41d8308`). It is not evidence of the external approved authority; see `ui-authority-contamination-report.md` |
| Config/schema/payment verification | **PASS** | `verify-config`, `verify-schema` (41 required tables), `verify-payment-token-config` |
| Goldsky config verifier | **PASS** | Existing verifier validates historical Robinhood topology; Base deployment is separately recorded in `base-sepolia-subgraph.md` |
| Security | **PASS** for 16 executable negative cases | `artifacts/verification/security-report.md`; chain-delegated listed-Advantage case remains explicitly delegated |
| Accessibility | **PASS** (warnings only) | Desktop/390px audits; no serious findings, contrast warnings recorded in `accessibility-report.md` |
| Performance | **PASS** | Home/Discover/Launch/Market/Builder/Dashboard/Create measurements in `performance-report.md`; no iframe fleet or malformed Pack sequence |
| Contract suites | **33/33 previously passing** | PrimaryLaunchTrio 12/12, MintAdvantageIntegration 7/7, NexListingRegistry 14/14; historical/domain support, not a substitute for live product proof |
| Playwright focused teardown | **PASS** | Live-mint focused test 1/1 exited cleanly after webserver shutdown fix |
| Playwright Create rerun | **2/2 pass** | Desktop/mobile Create draft test after fixing `published` return-variable regression |
| Playwright full suite | **22/24 pass on last full run** | Two failures were both the same `ReferenceError: published is not defined`; a full post-fix rerun was not performed before freeze |

## Existing report paths

- `artifacts/verification/base-sepolia-subgraph.md`
- `artifacts/verification/base-sepolia-final-certification.md`
- `artifacts/verification/database-migration-report.md`
- `artifacts/verification/security-report.md`
- `artifacts/verification/accessibility-report.md`
- `artifacts/verification/performance-report.md`
- `artifacts/verification/final-live-preflight.md`
- `artifacts/verification/final-live-browser/`
- `artifacts/verification/post-repair-functional/`
- `artifacts/verification/final-visual/`

## Current known production-critical gap

The fresh Base Edition's mint is time-gated until `2026-09-10T16:08:27Z`.
Consequently the fresh Base primary acquisition, ownership, Advantage, Market,
replacement-order, secondary-sale, accounting, and post-mint subgraph evidence
are not present. The historical Robinhood lifecycle evidence must not be merged
with Base evidence.
