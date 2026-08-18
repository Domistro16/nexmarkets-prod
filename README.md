# NexMarkets Production — Phase 0/1 Bootstrap

This repository is the production implementation bootstrap for the certified NexMarkets V1 experience.

**Product authority:** `NEXMARKETS_ELITE_RELEASE_CANDIDATE.html`  
**SHA-256:** `24daa3e2afc280690db3d213f953334b10cf92309f2698552c5db543b00b90a6`

V1 is **Robinhood Chain + USDG only**. Base and WETH settlement are explicitly disabled.

## Current phase

- Phase 0 repository / authority bootstrap: implemented.
- Phase 1 external primitive verifier: implemented and fail-closed.
- Feature smart contracts: intentionally not started until strict primitive runtime gates are satisfied.

Run:

```bash
npm test
npm run phase01:check
npm run verify:primitives:mainnet
```

`verify:primitives:*` needs RPC access. `--strict` refuses release certification if expected runtime hashes/required identities are not pinned.

See `docs/PHASE_0_1_STATUS.md`.
