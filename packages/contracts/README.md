# Contracts - gated NexMarkets contracts

The Robinhood primitive gate and Protocol Admin Safe approval are complete for
the frozen bootstrap manifest. NexPassEdition is now the first feature contract
in the NexMarkets Edition scope. It is intentionally narrow: it owns the
permanent ERC-721 collection/serial/ownership layer, while Terms, Preview,
payment collection, mint intent, Advantages, listings, and delayed royalty
settlement remain separate contracts that must be reviewed before deployment.

Pinned baseline:

- OpenZeppelin Contracts: `5.6.1` / commit `5fd1781`
- forge-std test library: commit `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`
- Foundry compiler runner: `v1.7.1` through the pinned toolchain action revision
  in `.github/workflows/contracts-ci.yml`
- Seaport 1.6: canonical source `ProjectOpenSea/seaport-core@523097f`; Robinhood mainnet canonical address is currently observed empty/EOA and therefore requires canonical deployment before use
- ConduitController verification source: `ProjectOpenSea/seaport@821a049`
- ERC-6551: canonical registry, pinned account implementation after review

Next contract set after NexPassEdition review:

`NexPassFactory`, `NexLaunchRegistry`, `NexMintController`, `NexAdvantageRegistry`, `NexListingRegistry`, `NexMarketsZone`, `NexRoyaltyVault`.

## NexPassEdition boundary

`NexPassEdition` is deployed once per permanent Edition identity. Its
constructor pins only collection state: the edition identifier, fixed supply,
artwork commitment, base metadata URI, and ERC-2981 royalty recipient/rate.

`NexLaunchRegistry` owns the canonical Terms and Preview versions, including
price, USDG settlement terms, Preview timing, mint timing, Advantages, and
referral terms. A material Terms change therefore updates the launch record and
restarts Preview without fragmenting the ERC-721 identity into a new contract.

The Protocol Admin Safe sets the mint controller exactly once. The controller
must be a deployed contract, must validate the active approved Terms version,
and must collect/account for USDG before calling `mint`. Each mint binds that
Terms version hash into the `EditionMinted` event. The edition contract does not
pull funds or implement Terms, Preview, Advantage, referral, or royalty-lock
logic.
