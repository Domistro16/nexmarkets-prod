# Contracts - permissionless Outerfield Passes

The Robinhood primitive verification and shared-infrastructure deployment review
are complete for the frozen bootstrap manifest. Neither process gates creator
Pass creation. OFLDPassEdition is the first feature contract in the Outerfield
Edition scope. It is intentionally narrow: the creator owns the
permanent ERC-721 collection/serial/ownership layer, while Terms, Preview,
payment collection, mint intent, Advantages, listings, and delayed royalty
settlement remain separate contracts that must be reviewed before deployment.

Pinned baseline:

- OpenZeppelin Contracts: `5.6.1` / commit `5fd1781`
- forge-std test library: commit `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`
- Foundry compiler runner: `v1.7.1` through the pinned toolchain action revision
  in `.github/workflows/contracts-ci.yml`
- Seaport 1.6: canonical source `ProjectOpenSea/seaport-core@523097f`; the Robinhood canonical address is deployed and runtime-verified, so no Outerfield deployment is required
- ConduitController: canonical `ProjectOpenSea/seaport@821a049` build is deployed and runtime-verified at Robinhood's canonical address
- ERC-6551 registry: canonical `0x000000006551c19487814612e58FE06813775758`, pinned reference commit `43a84573bb47b0df3ab543a20365f4974f56a809`
- OFLDPassAccount build runtime hash: `0xc849f1d83cf1d83f7f1de0a071c117b32e94d59aacf3e8c3599ee7cc69e52963`

Testnet certification uses the isolated `MockUSDG` contract in
`src/MockUSDG.sol` (six decimals, owner-controlled issuance). It is never a
valid mainnet settlement substitute; the mainnet planner is fail-closed to the
canonical USDG manifest address.

The first connected primary-launch boundary is now:

`OFLDPassFactory` -> `OFLDLaunchRegistry` -> `OFLDMintController` -> `OFLDPassEdition`

`OFLDPassFactory` is permissionless and deploys an Edition with CREATE2, wires
the one-time MintController, registers the caller as publisher, and hands
ownership to that creator. `OFLDLaunchRegistry` is the canonical
Terms/Preview authority. Each material change creates a new version hash and
restarts the Preview; it cannot lower active supply below already minted
serials. `OFLDMintController` accepts only the active Registry version, settles
exact USDG using the protocol-fixed 5% primary fee, scopes idempotency
keys to the payer, and calls the Edition only after all validation succeeds.

The deployment order is Registry (with the verified USDG address),
MintController, Factory, shared-governance Factory binding, then permissionless
creator Edition creation. No contract in this trio is upgradeable. Production deployment still
requires the release evidence and Protocol Admin Safe policy recorded in the
repository.

The secondary settlement boundary is `OFLDListingRegistry` plus the thin
`OuterfieldZone` and `OFLDRoyaltyVault`. The registry binds each Seaport order
to one exact Edition/token ID, seller, historical Terms version, USDG price,
ERC-2981 Builder Royalty snapshot, and expiry. It fixes Outerfield' secondary
fee at 1% and requires the signed price to split exactly into protocol fee,
Vaulted Builder Royalty, and seller proceeds. The buyer pays no surcharge. The
royalty still enters the Vault when Builder equals seller, then becomes
withdrawable only after 30 days. The zone authenticates the verified Seaport
1.6 caller and forwards the canonical pre/post-transfer callbacks; it does not
fork or redeploy Seaport. Listing state drives the one-time Advantage lock, and
cancellation, fill, expiry, or direct transfer cannot leave a stale order
usable.

The complete Pass lifecycle also contains `OFLDAdvantageInitializer`, which is
permanently wired to `OFLDMintController` and `OFLDAdvantageRegistry`. Terms with
a nonzero Advantages commitment cannot mint unless every exact serial is
initialized in the same transaction. Any commitment or initialization failure
reverts USDG settlement, serial minting and the payer-scoped intent.

`OFLDTBAResolver` deterministically maps a factory Edition/token ID to a
canonical-registry ERC-6551 account using the pinned `OFLDPassAccount`
implementation. TBA control follows ERC-721 `ownerOf`; the TBA is never the
authority for Terms, serials, Advantage, listings or royalties.

Complete V1 custom contract set:

`OFLDPassFactory`, `OFLDLaunchRegistry`, `OFLDMintController`, `OFLDAdvantageRegistry`, `OFLDAdvantageInitializer`, `OFLDListingRegistry`, `OuterfieldZone`, `OFLDRoyaltyVault`, `OFLDPassAccount`, `OFLDTBAResolver`.

`OFLDAdvantageRegistry` authenticates each initialized config array against the
Terms `advantagesHash` using its versioned `ADVANTAGES_DOMAIN`. Use IDs are
scoped to the exact Edition, serial, and Advantage and bind the applied
quantity. Listing locks survive direct transfers, and each TimeBased
Advantage pauses only for the portion of a listed interval that reaches its
own window.

## OFLDPassEdition boundary

`OFLDPassEdition` is deployed once per permanent Edition identity. Its
constructor pins only collection identity and the immutable absolute
serial/artwork cap: the edition identifier, absolute supply cap, artwork
commitment, and base metadata URI. It does not freeze the currently advertised
Terms supply or Builder Royalty.

`OFLDLaunchRegistry` owns the canonical Terms and Preview versions, including
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
canonical onchain association used by Advantage, Market, and settlement
contracts. The edition contract does not pull funds or implement Terms,
Preview, Advantage, referral, or royalty-lock logic.
