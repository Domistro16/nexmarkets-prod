# ERC-6551 / NexPass TBA

NexMarkets uses the canonical ERC-6551 Registry at `0x000000006551c19487814612e58FE06813775758`. The registry/reference source is pinned to `erc6551/reference` commit `43a84573bb47b0df3ab543a20365f4974f56a809` (v0.3.1). `NexPassAccount` follows that release's simple account control model and is built with the repository-pinned compiler settings; its expected build runtime hash is recorded in both Robinhood ERC-6551 manifests.

`NexTBAResolver.account(edition,tokenId)` is deterministic over the canonical Registry, pinned implementation, chain ID and `NEXMARKETS_PASS_TBA_V1` salt. Account creation is permissionless and idempotent but restricted by the resolver to Factory Editions and minted tokens.

ERC-721 `ownerOf` remains control authority. Transfer changes the valid TBA signer immediately. The account can execute ordinary calls for its current owner, but it receives no NexMarkets publisher, controller, initializer, listing or Vault authority. It cannot replace ownership, Terms, serial, Advantage, listing or royalty state.

The canonical Registry runtime is pinned on mainnet and was independently read from Robinhood testnet on 2026-08-20 at the same expected hash, `0xda1d5b06e579f9e42e59b00fbc22939896ecb38dc8830d40de0a2508fecd6735`. The testnet NexPassAccount and NexTBAResolver are deployed and runtime-verified in `deployments/robinhood-testnet.v1-deployment.json`; no mainnet deployment is performed by this repository change.
