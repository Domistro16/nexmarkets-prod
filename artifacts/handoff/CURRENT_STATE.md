# NexMarkets current state (forensic handoff)

IMPORTANT:
The repository copy of NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html was modified
during the Codex implementation and is NOT the approved UI authority.

The actual approved authority is external to this repository and must be
supplied separately by the user.

The repository copy is preserved only for forensic comparison.

Freeze capture date: 2026-09-09 (Africa/Lagos). This document describes the
working tree exactly as captured; it is not a claim that the product is ready
for release. No application, contract, database, subgraph, environment, asset,
or documentation changes were made after the freeze instruction. The only
files added after that instruction are the handoff artifacts themselves.

## A. Work implemented during the current run

- Set Base Sepolia (`84532`) as the current default testnet while retaining
  Robinhood testnet (`46630`) as selectable historical support.
- Verified the existing Base primitives and deployed a new permissionless Base
  NexMarkets contract set because the previously configured Safe-only Factory
  was incompatible with ordinary Builder publication. The old manifest is
  retained as `deployments/base-sepolia.v1-deployment.legacy-safe.json`.
- Deployed Goldsky Subgraph `nexmarkets-v1-base-sepolia/1.0.1` using the existing
  schema/mapping/event architecture and Base addresses. It was recorded
  healthy/Active/Synced 100% with zero lag at the readiness probe.
- Connected Base RPC, USDC, contract policy, subgraph selection, network copy,
  wallet chain prompts, and generated web configuration to Base Sepolia.
- Changed Create Phase 6 publication to save a private draft, create the Edition,
  publish Terms v1, wait for the receipt, and only then promote the Product to
  `PUBLISHED` with chain identifiers and Terms markers.
- Added Terms/hash validation to mint preparation and fail-closed lifecycle
  classification; Terms-less or not-yet-open Editions are not treated as
  Debut. Discovery resolves sparse indexed Terms from the Edition detail before
  classifying a surface.
- Completed the browser Change Price path as cancel/wait/hydrate/sign/register
  replacement order (the protocol representation is an off-chain signed order,
  so an invented transaction hash is not expected).
- Added canonical `/builders/:handle` routing, Builder profile persistence, and
  live PostgreSQL Builder update/Q&A answer flow.
- Fixed the PostgreSQL Builder profile lookup to use `links->>'handle'` rather
  than a nonexistent `builder_profile.handle` column.
- Fixed the Create draft return path exposed by the browser suite.
- Fixed generated web configuration so Robinhood does not inherit Base name/RPC
  fields from the previous flat config.
- Made `subgraph/package.json`'s build command use `graph build --skip-migrations`
  so the local build exits cleanly on this Windows environment.
- Updated Base/Robinhood payment-token and Change Price documentation and
  changed the authority manifest/checksum to point at the repository V2 copy;
  that copy is now classified MODIFIED_BY_CODEX and the manifest must not be
  treated as evidence of the external approved authority. See
  `ui-authority-contamination-report.md`.
- Added a bounded webserver shutdown path so Playwright-owned teardown exits.

## B. Remains incomplete

- The fresh Base Edition is in an immutable 24-hour Preview. Its `mintStartsAt`
  is `2026-09-10T16:08:27Z`; therefore no fresh Base primary mint, Reveal,
  Advantage use, listing, replacement order, delist/relist, or secondary sale
  has been executed. No transaction was fabricated to bypass the clock.
- Because the fresh mint is not open, Base primary-sale accounting, live Pass
  ownership/download, Advantage transfer, Market settlement, and complete
  Base subgraph journey evidence remain unproven.
- `productionReady` remains `false`; the six release evidence flags are absent/
  false in the local environment. `/readyz` itself was HTTP 200 under the local
  Base harness with PostgreSQL, RPC, and Goldsky freshness checks green.
- Public Terms still lack verified legal operator/contact details. No legal
  information was invented; this remains a public legal-release blocker.
- The full Playwright suite was last run before the final draft-return fix (22
  passed, 2 failed on `ReferenceError: published is not defined`). The focused
  Create rerun then passed 2/2 and focused live-mint passed 1/1; a full post-fix
  rerun was not performed before the freeze.
- The PostgreSQL test harness run was not a clean complete pass: one
  environment-sensitive assertion expected an empty Base read while the real
  Goldsky endpoint returned live data, and the child suite hung during teardown.

## C. Current behavior/configuration by area

| Area | Current state |
|---|---|
| Base Sepolia | Default current testnet, chain `84532`, canonical USDC, permissionless Factory deployment, Goldsky 1.0.1 configured |
| Robinhood testnet | Retained selectable historical testnet, chain `46630`, MockUSDG, historical Safe-mediated Factory and Goldsky 1.0.1 |
| Default network | `base-sepolia` in runtime harness and generated web config |
| Base subgraph | `nexmarkets-v1-base-sepolia/1.0.1`, endpoint and datasource inventory in `chain-and-subgraph-state.md`; last indexed observation block `46600975` |
| Goldsky | Base deployment added; Robinhood deployment retained. Legacy Turbo remains a deprecated compatibility path in repository configuration |
| Create Publish | Two-phase draft → Edition → Terms v1 receipt → PUBLISHED promotion |
| Terms | Fresh Base Terms v1 published on-chain; hash `0xba0bf9f922cf8846616472b5f44cd6e9983e868b8bf9955eff38ea038d363c5f` |
| Lifecycle | API/Discover now fail closed for Terms-less/not-open launches; fresh Base state is Preview |
| Discover | Public results omit DRAFT and derive Preview/Debut/Closed from Terms/timing plus Registry proof where available |
| Minting | Base mint preparation checks current Terms hash and timing; live fresh mint awaits the protocol window |
| Advantage | Domain/API and historical Robinhood evidence exist; fresh Base use/transfer is pending mint |
| Market | Historical Robinhood evidence exists; Base listing and secondary settlement are pending fresh mint |
| Change Price | UI replacement-order sequence implemented; no fresh Base order hash exists yet |
| Builder profile | Canonical independent Builder identity and `/builders/:handle` route implemented; live profile/update/Q&A persistence exercised |
| Production readiness | `productionReady:false`; no manual override was made |

## D. Known broken or hazardous behavior

1. A fully fresh Base lifecycle cannot be completed until the immutable Preview
   interval elapses; this is a protocol/time gate, not a hidden UI bypass.
2. `.env.example` still contains older Base-scoped contract placeholder
   addresses, while the verified manifest/source fallbacks use the newer
   permissionless Base deployment. An engineer populating those variables from
   the example without reconciling the manifest can override valid fallbacks.
3. Existing verification artifacts contain older Robinhood wording and fixture
   evidence; they are historical evidence and must not be mistaken for fresh
   Base proof.
4. The full browser suite's only observed failures were from the draft return
   variable fixed immediately before the freeze; the complete suite was not
   rerun afterward.

## E. Processes at freeze

- No NexMarkets API/web listener was left on ports `4020` or `4173`.
- The Playwright-owned server and focused test processes exited normally after
  the shutdown fix.
- Four background `node` PIDs (`11420`, `16008`, `17660`, `23012`) were visible
  but could not be attributed to NexMarkets under the restricted process
  inspection; inspect them before terminating anything.

## F. Deployments and on-chain evidence made during this run

### Base contracts / wiring

The current Base contract set and Safe/wiring transactions are recorded in
`deployments/base-sepolia.v1-deployment.json` and summarized in
`chain-and-subgraph-state.md`. Status: `DEPLOYED_WIRED_AND_VERIFIED_PERMISSIONLESS`.

### Goldsky

- Deployment: `nexmarkets-v1-base-sepolia/1.0.1`
- Endpoint: `https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-base-sepolia/1.0.1/gn`
- The prior Base `1.0.0` deployment was removed before this freeze because the
  Goldsky project quota was full; Robinhood `1.0.1` was not removed.

### Fresh Base certification Edition

- Builder: `bld_e1ac9bff-a27d-40a0-bd49-f6d08bc8dfd6`
- Product: `prj_35904e55-939c-48a7-9db3-c6d1ce35bf5f`
- Edition: `0xa83a555e4e087ddf261c7ab3cffdff877c83a0fd`
- Edition ID: `0x965ea73e9f7cfa0bb0fd2d6da0da9a7180f80e314eac4b2151fc4947636f7d52`
- Edition creation tx/block: `0x570f25b53b2582ebf80b0f18edb68fa2f75f0c97aebcec0fb9c630cd5e4ec734` / `46600758`
- Terms v1 tx/block: `0x0009ba6aa55133c62b8c806f0c84b55f6b62e897ea7e23b18941837a3240b0b2` / `46600853`
- Terms hash: `0xba0bf9f922cf8846616472b5f44cd6e9983e868b8bf9955eff38ea038d363c5f`

The complete transaction table is in
`artifacts/verification/base-sepolia-final-certification.md`; rows after Terms
are explicitly scheduled, not marked successful.

## G. Database migrations

No production migration was run as part of the freeze. The repository contains
migrations through `0009_multi_builder_secondary_relationships.sql`. The safe
verification run applied all nine to an ephemeral schema and reported preserved
IDs/integrity; see `artifacts/verification/database-migration-report.md` and
`database-state.md`.

## H. New/required environment variables

No secret value is recorded here. The current Base path requires (or uses
fallbacks for) `BASE_SEPOLIA_RPC_URL`, `BASE_SEPOLIA_USDC_ADDRESS`,
`BASE_SEPOLIA_NEXMARKETS_SUBGRAPH_URL`/`NEXMARKETS_SUBGRAPH_URL`, and
`NEXMARKETS_DEFAULT_NETWORK=base-sepolia`; local serving also uses
`NEXMARKETS_API_PORT`, `NEXMARKETS_WEB_PORT`, and
`REQUIRE_INDEXED_READINESS`. Full variable names and descriptions are in
`required-env-vars.txt`.
