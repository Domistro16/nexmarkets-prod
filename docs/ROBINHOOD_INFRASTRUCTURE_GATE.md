# Robinhood Infrastructure Gate — Runtime Verified; Initial Production Safe Policy Recorded

Observed and independently checked on 2026-08-18 against Robinhood mainnet
chain ID `4663`.

## Gate result

`npm run verify:primitives:mainnet:strict` passes all pinned runtime checks.
Canonical infrastructure was already deployed, so no deployment transactions
were submitted.

## Canonical marketplace primitives

- Immutable CREATE2 factory, Seaport 1.6, and ConduitController are present at
  their canonical addresses.
- Pinned OpenSea source builds match all non-immutable deployed runtime bytes.
- Seaport `information()` reports version `1.6` and the canonical controller.
- ERC-6551 Registry and Safe 1.4.1 Singleton match their pinned runtime hashes.

## USDG structure and authority

- Token: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, `Global Dollar`, `USDG`, 6 decimals.
- Architecture: ERC-1967 proxy with UUPS implementation
  `0x68184c449e1a8f34fa18d289737129FD27B66f8F`.
- SupplyControl: ERC-1967/UUPS proxy
  `0xdf5FfF9cb88B3cAb50572FAE73E2EB08599D25D4`, implementation
  `0xa83de9D4f4116B9699bAb8c70Cb8cE9634c3AE24`.
- OFT wrapper: `0x0d54755f5106BfdB43f7a35f5D49a23F940628d1`, implementation
  `0x0e0CDCD065d885a36586a0706BDEAB31A5c09150`.
- Token and SupplyControl default admin: verified OpenZeppelin
  TimelockController `0xcfa0388f5ddf905fdc08c45c716c15dc10a14c6f`.
- Current timelock execution delay: 86,400 seconds. Default-admin transfer
  delay on both UUPS systems: 10,800 seconds.
- Timelock proposer/executor, token pause and asset-protection, and
  SupplyControl-manager roles currently converge on EOA
  `0x3af3e85f4f97de7ad0f000b724fb77fe5ffc024b`.
- No pending default-admin transfer was observed and USDG was not paused.

The verified source confirms that the default admin can authorize upgrades and
change SupplyControl; separate roles can pause transfers, freeze or wipe
balances, and manage mint/burn controllers. NexMarkets must therefore treat
protocol-held USDG as exposed to issuer upgrade, pause, freeze, and supply
control risk. The operational-role convergence on one EOA is an additional
key-compromise and availability risk even though upgrades are timelocked.

## Release boundary

The pinned manifest is frozen at source commit `2da21ae`. Its current SHA-256 is
`2c609951e0f20a33187d0bbab68217abfc3d4993d8dc26d5803bbf1940e512a5`.

GitHub Actions may attest this exact manifest and the production release
artifact when repository support is available, but those attestations are
optional provenance for NexMarkets Edition. The bootstrap Protocol Admin Safe
`0x722ADAadD314dafE97979AF27Ec7F09F36766d08` approved the same digest using
its threshold-1 EIP-1271 signing path; the result was independently verified
against the Safe bytecode and returned the EIP-1271 magic value. The public
record intentionally excludes the signature; only the verification status,
approved digest, Safe address, and governance profile are recorded in
`docs/release/robinhood-mainnet.safe-approval.json`.

The initial-production Protocol Admin Safe has the minimum two owners required by the production
policy. Threshold 1 is permitted for initial production deployment and
controller handoff under `INITIAL_PRODUCTION_THRESHOLD_1_MINIMUM_2_OWNERS`.
The release record carries the explicit planned transition
`RAISE_THRESHOLD_TO_2_PLUS`; threshold >= 2 is the ongoing governance target.
`NexPassEdition` may enter contract review and test CI now; a missing GitHub
attestation does not block review.

Primary references:

- https://docs.robinhood.com/chain/contracts/
- https://docs.paxos.com/guides/stablecoin/usdg/mainnet
- https://github.com/paxosglobal/usdg-contract
- https://github.com/ProjectOpenSea/seaport/blob/main/docs/Deployment.md
- https://github.com/ethereum/ERCs/blob/master/ERCS/erc-6551.md
