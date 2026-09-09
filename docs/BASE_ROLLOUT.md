# Base rollout

NexMarkets supports Robinhood and Base as separate network contexts. The web
navbar selector changes the active network, persists it locally, switches an
injected wallet when possible, and sends `x-nex-network` on API requests. The
API keeps chain-specific sessions, settlement assets, contracts and read
models isolated. Base Sepolia is the default current testnet and its Goldsky
read model is configured and health-checked.

## Networks

| Network | Chain ID | Settlement | RPC | Explorer |
| --- | ---: | --- | --- | --- |
| Robinhood mainnet | 4663 | USDG | `RH_MAINNET_RPC_URL` | Robinhood Chain Blockscout |
| Robinhood testnet | 46630 | MockUSDG | `RH_TESTNET_RPC_URL` | Robinhood testnet explorer |
| Base mainnet | 8453 | canonical USDC, 6 decimals | `BASE_MAINNET_RPC_URL` | `https://basescan.org` |
| Base Sepolia | 84532 | canonical USDC, 6 decimals | `BASE_SEPOLIA_RPC_URL` | `https://sepolia.basescan.org` |

Base testnet and mainnet use Circle's canonical USDC addresses recorded in
the corresponding deployment manifests. Testnet USDC is not a production
settlement asset.

The current browser default is **Base Sepolia + USDC**. Robinhood testnet is
an explicitly selected historical/testnet context and retains its isolated
MockUSDG settlement token.

Market **Change price** is a complete Seaport replacement flow: NexMarkets
invalidates the old signed order, asks the seller to sign a replacement order,
and only then exposes the new ask. The old order hash and replacement order
hash are retained in the listing projection; there is no fabricated transaction
hash for the off-chain signature step.

## Base Sepolia evidence

Base Sepolia V1 is deployed, wired and verified. The public evidence record is
`deployments/base-sepolia.v1-deployment.json`; it contains the Safe
deployment, all ten protocol contract deployments, transaction/block evidence,
runtime hashes and the six one-time wiring transactions.

The protocol Safe is
`0xE6D0846e6C0b51C61FdDb593A1914b85181E5783`. The deployment source is frozen
to commit `8790b635ba55512e5d0e295fb1217a3993ecdafb`.

Regenerate the testnet browser configuration after changing deployment
records:

```powershell
cmd /c npm run web:config:testnet
```

The generated configuration exposes Base Sepolia first (the default) and
Robinhood testnet as an explicitly selectable historical/testnet context. It
does not expose Base mainnet as an active browser network until the mainnet
release gate is approved.

## Base deployment commands

All planning commands are read-only. Base Sepolia Safe deployment and Safe
bundle execution require explicit broadcast flags and a funded deployer/Safe
workflow:

```powershell
cmd /c npm run safe:plan:base:testnet
cmd /c npm run deploy:v1:plan:base:testnet
node scripts/execute-safe-bundle.mjs --network=base-sepolia --phase=deploy --plan-sha256=<plan-sha> --broadcast
node scripts/execute-safe-bundle.mjs --network=base-sepolia --phase=wire --plan-sha256=<plan-sha> --broadcast
node scripts/verify-v1-deployment.mjs --network=base-sepolia --post-wire
```

The Base mainnet Safe and protocol plan are prepared but not broadcast. The
review records are `deployments/base-mainnet.v1-prepared.json` and
`deployments/nexmarkets-v1.inputs.base-mainnet.json`.

```powershell
cmd /c npm run safe:plan:base:mainnet
cmd /c npm run deploy:v1:plan:base:mainnet
cmd /c npm run safe:plan:base:mainnet
```

Before any Base mainnet transaction, independently confirm the Safe owners and
threshold, approve the frozen source/plan and manifest, fund the sender and
Safe with mainnet ETH, configure the Base mainnet contract addresses after
deployment, verify every runtime/immutable relationship, and only then run
the separately approved Safe deployment and deploy/wire phases. No Base
mainnet transaction is authorized by the current preparation record.

## Operations

For Base workers, set `NEXMARKETS_DEFAULT_NETWORK=base-sepolia` (or explicitly
select `base-mainnet`) and provide the
matching `BASE_*_NEX_*_ADDRESS` values from the verified deployment record.
Indexer, lifecycle-worker and reconciliation entry points select the matching
Base RPC and address namespace. A Base Subgraph must be built from a
Base-specific manifest with the deployed addresses and start block before
Base read-model data is enabled in production.
