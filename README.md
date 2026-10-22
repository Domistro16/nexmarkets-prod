# NexMarkets V1 production implementation

Outerfield is an exact-serial Pass market for Robinhood Chain. The active app
targets Robinhood mainnet (chain `4663`) with USDG settlement. Mainnet contracts
and its Goldsky index are not deployed; onchain actions remain closed until release.
Use `npm run web:config:testnet` explicitly for MockUSDG development. ETH is gas only. Base rollout records are
retained as historical implementation evidence. The certified product authority is
`NEXMARKETS_HOMEPAGE_DISCOVER_MARKET_COLLECTIBLE_ROTATION_PASS_TEXT_FIT_UX_FIXED.html` with SHA-256
`637b7c606ef710f9966373f36238b779cd746303638d4fd46a7e01c92acd34b7`.

## Implemented boundaries

- Permanent finite ERC-721 Editions, versioned Terms/Preview and an exact 5% primary fee.
- Atomic mint-to-Advantage initialization authenticated by `ADVANTAGES_DOMAIN`.
- Exact-Pass Advantage state, listing locks and approved per-Advantage TimeBased freezing.
- Seaport 1.6 ListingRegistry/Zone policy with exact 1% secondary fee, no surcharge and a 30-day Builder Royalty Vault.
- ERC-6551 canonical-registry integration with a deterministic, source-pinned Pass account and resolver. TBA state is never canonical NexMarkets state.
- Goldsky Subgraph-first indexing package with dynamic Factory Edition templates, historical Terms/Pass/Advantage/listing/royalty/TBA entities and `_meta`-based readiness; the previous Turbo raw-log pipeline remains a deprecated rollback/archive path.
- A chain-aware Subgraph client feeds API read paths while separate RPC receipt, lifecycle and reconciliation workers select the active network. PostgreSQL remains application state, not the raw-chain store.
- PostgreSQL V1 migrations for product, indexed, transaction, referral, outbox, audit, media and reconciliation data.
- Wallet-signed authentication, opaque sessions, CSRF/origin/rate controls, transaction/order preparation and a no-custody API.
- Builder Edition creation is permissionless on the current Base Sepolia Factory; the authenticated Builder wallet creates the Edition and publishes its Terms. Robinhood's retained Safe-mediated Factory path remains supported. Exact Advantage configs are persisted by their canonical commitment before Terms calldata is prepared.
- Responsive real-data web flows for Home, Discover, Pass, Market, Create, holder/builder dashboards and transaction finality.
- Deterministic deployment planning, one-time wiring order, runtime verification and Safe policy checks.

## Current release gates and evidence

- The active web and API default to Robinhood testnet; Base is not an available app network. Goldsky remains the indexing provider. External-wallet sign-in is enabled; the retained Base-only CDP social adapter and stock reward flow are not enabled for Robinhood.
- No Robinhood or Base mainnet deployment has been performed.
- Robinhood testnet V1 is deployed, wired and verified; its complete live certification record is `artifacts/testnet-certification/secondary-lifecycle.json`.
- Base Sepolia V1 is deployed, wired and verified; its public record is `deployments/base-sepolia.v1-deployment.json`. Base mainnet is prepared but not broadcast; see `docs/BASE_ROLLOUT.md`.
- Goldsky's testnet Subgraph deployment and endpoint are recorded in `deployments/robinhood-testnet.goldsky-subgraph.json` (currently recorded as `nexmarkets-v1-robinhood-testnet/1.0.3`). Static contract sources start at their own corrected deployment blocks, with dynamic Edition indexing from the Factory. Turbo is no longer the active read model; its retained files serve rollback/archive validation only.
- Canonical ERC-6551 Registry and the testnet NexPassAccount/NexTBAResolver runtime are verified; the mainnet custom runtime remains undeployed.
- PostgreSQL retains application/business state and transaction lifecycle data. The five legacy raw-chain/projector tables retain their schema for rollback/tests but contain zero rows.
- The referral tier percentages are fixed at 5/10/15/20; the sales-count thresholds remain an explicit business-policy input rather than invented economics.

## Local gates

```bash
npm ci
npm audit --audit-level=high
npm test
npm run web:build
npm run verify:config
npm run verify:authority
npm run verify:schema
npm run verify:goldsky
npm run verify:production
npm run verify:checksums
```

Subgraph local validation uses `graph codegen` and `graph build`; deployment is
Goldsky-only via `goldsky subgraph deploy`. The Graph deployment commands are
not part of NexMarkets operations.

With PostgreSQL available, run `npm run db:migrate`. Contract CI installs the exact pinned Foundry, OpenZeppelin and forge-std revisions before `forge fmt --check`, `forge build` and `forge test -vvv`.

See `docs/OPERATIONS_RUNBOOK.md`, `docs/DEPLOYMENT_V1.md`, `docs/INDEXING_GOLDSKY.md`, `docs/API_V1.md` and `docs/RELEASE_CHECKLIST_V1.md`.
