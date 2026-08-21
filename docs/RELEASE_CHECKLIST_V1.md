# V1 release checklist

- [ ] Final exact commit reviewed; clean tree; SHA256SUMS reproduced.
- [ ] Foundry format/build/all tests and 5,000-run fuzz pass.
- [ ] Node/API/web/indexer/reconciliation/order tests pass.
- [ ] PostgreSQL migrations apply to a clean production-equivalent database.
- [ ] Goldsky Subgraph deployed/healthy on the intended Robinhood network in the `Nexmarkets` project; GraphQL `_meta` indexing progress is within the RPC-head freshness threshold. Turbo raw ingestion is deprecated for the V1 product read path and may remain only as an explicitly documented rollback/archive pipeline.
- [ ] Mainnet/testnet primitive and ERC-6551 runtime hashes verified through RPC.
- [ ] Safe has at least two owners and threshold at least 1; `RAISE_THRESHOLD_TO_2_PLUS` recorded when threshold is 1.
- [ ] Deterministic plan and every immutable/one-time relationship verified before wiring.
- [ ] API, web, object storage, observability and secret-manager configuration installed.
- [ ] Reconciliation is current and outbox has no unexplained dead letters.
- [ ] No mainnet deployment occurs from a PR review workflow.

## Testnet evidence (2026-08-20)

The testnet Safe, test-only MockUSDG, ten frozen-source V1 contracts and six
one-time bindings are deployed and independently verified. A certification
Edition at `0x4171D62F43B4168b07a01C04594455DBc3298437` has Terms published with
the mandatory 24-hour Preview; mint opens at `2026-08-21T21:42:30Z`. The
Goldsky-hosted Subgraph `nexmarkets-v1-robinhood-testnet/1.0.0` is healthy and
synced from block `104607054`; its public evidence is
`deployments/robinhood-testnet.goldsky-subgraph.json`. The Subgraph indexes the
certification Edition and exact Terms hash. No mainnet custom deployment has
occurred.
