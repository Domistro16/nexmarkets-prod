# Robinhood Infrastructure Gate — Runtime Verified, Awaiting Freeze and Signature

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

## Remaining release boundary

The pinned manifest candidate is intentionally marked `VERIFIED_UNSIGNED`.
Its current SHA-256 is
`c7a981151f5c92c96f809bfcae3d216adf36faba6fea8e14cfddb141069a2393`.
Because this workspace has no Git metadata, `sourceCommit` remains unset. An
authorized release signer must supply that provenance, freeze the final bytes,
and attach a signature without exposing a private key. `NexPassEdition` and the
custom NexMarkets contracts remain gated until that signature is independently
verified.

Primary references:

- https://docs.robinhood.com/chain/contracts/
- https://docs.paxos.com/guides/stablecoin/usdg/mainnet
- https://github.com/paxosglobal/usdg-contract
- https://github.com/ProjectOpenSea/seaport/blob/main/docs/Deployment.md
- https://github.com/ethereum/ERCs/blob/master/ERCS/erc-6551.md
