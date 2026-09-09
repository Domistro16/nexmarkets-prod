# NexMarkets restored handoff — 2026-09-09

## Restored authority

The root `NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html` is the untouched approved ChatGPT UI authority restored from the conversation, not the Codex-modified copy.

- Approved SHA-256: `4863df4a8829b6ced1672248e1fd0336e577d6c13c80f1dbd7fe99d73bc821d5`
- Codex-modified copy preserved at `artifacts/handoff/NEXMARKETS_V2_BUILDER_PROFILE_ELITE_CODEX_MODIFIED.html`
- Codex-modified SHA-256: `34bac0e30e66e2d0f675d71d2a22033e6b176b3351320bc1e5b97212d41d8308`

The product-authority manifest/config now points back to the approved authority hash.

## Generated web shell

The current static web entrypoints were regenerated from the restored authority and retain the production hydration bridge (`nm-v2-data-bridge.js` + `v2-app.mjs`) around the immutable authority rather than editing the authority itself.

## Pack authority

Verified locally from `packages/domain/src/pass-design.mjs`:

- 13 approved Pack options
- 5 approved colorways
- 65 Pack/colorway combinations
- deterministic frozen assignment for identical Edition seed + serial inputs

## Current network direction

The handoff's current runtime remains Base Sepolia first/default (`84532`), with Robinhood testnet retained for historical/support use. Existing Base Sepolia deployment/subgraph evidence is preserved in the repository handoff artifacts.

## Verification performed in this restored package

- `node scripts/verify-product-authority.mjs` — PASS
- Pack authority invariant check — PASS (13 / 5 / 65; deterministic)
- `SHA256SUMS` regenerated after the restoration

## Important live-chain note

The handoff records the fresh Base certification Edition's immutable Preview opening at `2026-09-10T16:08:27Z`. This package does not fabricate a mint/listing/resale before that protocol time. Existing Base and Robinhood chain/subgraph evidence remains preserved under `artifacts/verification/` and `artifacts/handoff/`.
