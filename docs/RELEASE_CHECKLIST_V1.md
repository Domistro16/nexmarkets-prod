# V1 release checklist

- [ ] Final exact commit reviewed; clean tree; SHA256SUMS reproduced.
- [ ] Foundry format/build/all tests and 5,000-run fuzz pass.
- [ ] Node/API/web/indexer/reconciliation/order tests pass.
- [ ] PostgreSQL migrations apply to a clean production-equivalent database.
- [ ] Goldsky Turbo pipeline deployed/backfilled/healthy on `robinhood-mainnet` or `robinhood-testnet` using project/API and PostgreSQL sink credentials.
- [ ] Mainnet/testnet primitive and ERC-6551 runtime hashes verified through RPC.
- [ ] Safe has at least two owners and threshold at least 1; `RAISE_THRESHOLD_TO_2_PLUS` recorded when threshold is 1.
- [ ] Deterministic plan and every immutable/one-time relationship verified before wiring.
- [ ] API, web, object storage, observability and secret-manager configuration installed.
- [ ] Reconciliation is current and outbox has no unexplained dead letters.
- [ ] No mainnet deployment occurs from a PR review workflow.
