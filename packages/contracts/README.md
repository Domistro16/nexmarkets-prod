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
- Seaport 1.6: canonical source `ProjectOpenSea/seaport-core@523097f`; the Robinhood canonical address is deployed and runtime-verified, so no NexMarkets deployment is required
- ConduitController: canonical `ProjectOpenSea/seaport@821a049` build is deployed and runtime-verified at Robinhood's canonical address
- ERC-6551: canonical registry, pinned account implementation after review

The first connected primary-launch boundary is now:

`NexPassFactory` -> `NexLaunchRegistry` -> `NexMintController` -> `NexPassEdition`

`NexPassFactory` is Protocol Admin Safe-controlled and deploys an Edition with
CREATE2, wires the one-time MintController, registers the Edition, and hands
ownership to the Protocol Admin Safe. `NexLaunchRegistry` is the canonical
Terms/Preview authority. Each material change creates a new version hash and
restarts the Preview; it cannot lower active supply below already minted
serials. `NexMintController` accepts only the active Registry version, settles
exact USDG using the immutable protocol fee configuration, scopes idempotency
keys to the payer, and calls the Edition only after all validation succeeds.

The deployment order is Registry (with the verified USDG address),
MintController, Factory, Safe-controlled Factory binding, then Edition
creation. No contract in this trio is upgradeable. Production deployment still
requires the release evidence and Protocol Admin Safe policy recorded in the
repository.

Next contract set after this primary-launch boundary:

`NexPassFactory`, `NexLaunchRegistry`, `NexMintController`, `NexAdvantageRegistry`, `NexListingRegistry`, `NexMarketsZone`, `NexRoyaltyVault`.

## NexPassEdition boundary

`NexPassEdition` is deployed once per permanent Edition identity. Its
constructor pins only collection identity and the immutable absolute
serial/artwork cap: the edition identifier, absolute supply cap, artwork
commitment, and base metadata URI. It does not freeze the currently advertised
Terms supply or Builder Royalty.

`NexLaunchRegistry` owns the canonical Terms and Preview versions, including
active supply, price, USDG settlement terms, Preview timing, mint timing,
Advantages, referral terms, and Builder Royalty recipient/rate. A material
Terms change therefore creates a new immutable Terms version and restarts
Preview without fragmenting the ERC-721 identity into a new contract.

The Protocol Admin Safe sets the mint controller exactly once. The controller
must be a deployed contract, must validate the active approved Terms version
and its advertised supply/Royalty snapshot, and must collect/account for USDG
before calling `mint`. The Edition independently enforces its absolute cap and
the supplied active Terms supply, then snapshots the Terms version hash and
Builder Royalty into every minted token. `termsVersionHashOf(tokenId)` is the
canonical onchain association used by future Advantage, Market, and settlement
contracts. The edition contract does not pull funds or implement Terms,
Preview, Advantage, referral, or royalty-lock logic.
