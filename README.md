# NexMarkets V1 production implementation

NexMarkets V1 is an exact-serial Pass market for Robinhood Chain. USDG is the only settlement asset; ETH is gas only. The certified product authority is `product-authority/NEXMARKETS_ELITE_RELEASE_CANDIDATE.html` with SHA-256 `24daa3e2afc280690db3d213f953334b10cf92309f2698552c5db543b00b90a6`.

## Implemented boundaries

- Permanent finite ERC-721 Editions, versioned Terms/Preview and an exact 5% primary fee.
- Atomic mint-to-Advantage initialization authenticated by `ADVANTAGES_DOMAIN`.
- Exact-Pass Advantage state, listing locks and approved per-Advantage TimeBased freezing.
- Seaport 1.6 ListingRegistry/Zone policy with exact 1% secondary fee, no surcharge and a 30-day Builder Royalty Vault.
- ERC-6551 canonical-registry integration with a deterministic, source-pinned Pass account and resolver. TBA state is never canonical NexMarkets state.
- Goldsky Turbo-first indexing templates (raw logs plus landed-block watermark), dynamic Edition event catalog, idempotent/reorg-safe projection and independent chain reconciliation entities.
- A runnable Postgres projector consumes Goldsky raw logs, decodes complete Terms, advances checkpoints/finality and resumes safely; a separate Robinhood receipt worker advances transaction jobs through CONFIRMED/FINALIZED or REVERTED/REORGED.
- PostgreSQL V1 migrations for product, indexed, transaction, referral, outbox, audit, media and reconciliation data.
- Wallet-signed authentication, opaque sessions, CSRF/origin/rate controls, transaction/order preparation and a no-custody API.
- Builder Edition creation is a durable project-linked Protocol Admin Safe request; the Builder wallet never submits the Safe-owned Factory call. Exact Advantage configs are persisted by their canonical commitment before Terms calldata is prepared.
- Responsive real-data web flows for Home, Discover, Pass, Market, Create, holder/builder dashboards and transaction finality.
- Deterministic deployment planning, one-time wiring order, runtime verification and Safe policy checks.

## External gates intentionally not fabricated

- No Robinhood mainnet deployment has been performed.
- Custom NexMarkets contract addresses remain unset until Safe-authorized deployment.
- Goldsky must enable dedicated Robinhood mainnet/testnet datasets before the Turbo template can be deployed.
- Canonical ERC-6551 Registry runtime is verified on both Robinhood networks; custom NexPassAccount/resolver runtime checks require their eventual deployed addresses.
- PostgreSQL integration tests require `DATABASE_URL`; when no database is available locally, those tests are explicitly skipped rather than reported as passing.
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

With PostgreSQL available, run `npm run db:migrate`. Contract CI installs the exact pinned Foundry, OpenZeppelin and forge-std revisions before `forge fmt --check`, `forge build` and `forge test -vvv`.

See `docs/OPERATIONS_RUNBOOK.md`, `docs/DEPLOYMENT_V1.md`, `docs/INDEXING_GOLDSKY.md`, `docs/API_V1.md` and `docs/RELEASE_CHECKLIST_V1.md`.
