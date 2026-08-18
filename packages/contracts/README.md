# Contracts — intentionally gated

Feature Solidity is **not** started in Phase 0/1.

Pinned baseline:

- OpenZeppelin Contracts: `5.6.1` / commit `5fd1781`
- Seaport 1.6: canonical source `ProjectOpenSea/seaport-core@523097f`; Robinhood mainnet canonical address is currently observed empty/EOA and therefore requires canonical deployment before use
- ConduitController verification source: `ProjectOpenSea/seaport@821a049`
- ERC-6551: canonical registry, pinned account implementation after review

Next contract set after strict primitive verification:

`NexPassFactory`, `NexPassEdition`, `NexLaunchRegistry`, `NexMintController`, `NexAdvantageRegistry`, `NexListingRegistry`, `NexMarketsZone`, `NexRoyaltyVault`.
