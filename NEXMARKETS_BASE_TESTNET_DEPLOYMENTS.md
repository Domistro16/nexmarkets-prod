# NexMarkets — Base Sepolia Deployment Record

All values below were read **live from Base Sepolia** during this session, not copied
from documentation.

- **Network:** Base Sepolia
- **Chain ID:** `84532` (confirmed via `eth_chainId`)
- **RPC used:** `https://sepolia.base.org`
- **Explorer:** `https://sepolia.basescan.org`
- **Head block at audit:** `46,813,867` → `46,816,862`
- **Head block at reward redeploy verification:** `46,828,032`
- **Settlement token:** canonical Base Sepolia USDC, 6 decimals, **not** a mock

> **Current addresses.** The 11-contract reward-capable graph was deployed on
> 2026-09-14 at blocks `46,827,960`–`46,827,982` and wired through `46,828,032`.
> The preceding permissionless 10-contract graph is retained in
> `deployments/base-sepolia.v1-deployment.e53f5d9.json`; the pre-fix Safe-only graph
> remains in `deployments/base-sepolia.v1-deployment.legacy-safe.json`.

## Chain consistency

`dist/config.json`, `public/config.json`, `deployments/base-sepolia.v1-deployment.json`
and `.env` all resolve to chain `84532` with identical contract addresses.
No mainnet, localhost or stale-chain references were found on the Base Sepolia path.

A second network (`robinhood-testnet`, chain `46630`) is configured in the same file
with its own address set and a **mock** settlement token (`MockUSDG`). It is correctly
isolated behind `availableNetworks` and `NEXMARKETS_DEFAULT_NETWORK`.

## Deployed contracts — bytecode confirmed present

| Contract | Address | Deployment block | Owner |
|---|---|---:|---|
| NexLaunchRegistry | `0x83125b7a5e8d4e79134D74f8E8b5052a58E054B5` | 46,827,960 | Safe |
| NexMintController | `0x8de2eD8bCB4216aF0b1a07D65A6dF229677BD758` | 46,827,962 | Safe |
| NexPassFactory | `0xcF0802892749fAD109c3B841b2a0D922D4DBD6ED` | 46,827,964 | Safe |
| NexAdvantageRegistry | `0x6D4Db1939D322411EdE8970eCB14b729788f75Aa` | 46,827,966 | Safe |
| NexAdvantageInitializer | `0x9b2f41F9602E3C1AA41a079893386E65AB130c1C` | 46,827,968 | Safe |
| NexRoyaltyVault | `0xCbf82F765c80446baa753a56C563ED0291374614` | 46,827,970 | Safe |
| NexListingRegistry | `0x21C397F20Db8da540d22F798d7EC7f7c16CE9241` | 46,827,972 | Safe |
| NexMarketsZone | `0x490d55643F2CAf4D5A178FC84cA01792952C8458` | 46,827,974 | Safe |
| NexPassAccount | `0x8F48738e4BB35F5F6Dc0E40cf939040364AD3682` | 46,827,978 | *(no owner — implementation)* |
| NexTBAResolver | `0x6B53e133DA10d456296930c041d17606d9283DaF` | 46,827,980 | *(no owner — immutable)* |
| NexRewardDistributor | `0x2453c5FCef787D076ff21614E54C50344FD1EB91` | 46,827,982 | Safe |

All eleven addresses returned non-empty bytecode and matched planned runtime hashes.
None are proxies; every contract is
non-upgradeable by design, so there is no implementation/ProxyAdmin layer to audit.

## Canonical primitives (verified present on Base Sepolia)

| Primitive | Address |
|---|---|
| Seaport 1.6 | `0x0000000000000068F116a894984e2DB1123eB395` |
| ConduitController | `0x00000000F9490004C11Cef243f5400493c00Ad63` |
| ImmutableCreate2Factory | `0x0000000000ffe8b47b3e2130213b802212439497` |
| ERC-6551 Registry | `0x000000006551c19487814612e58FE06813775758` |
| USDC (canonical testnet) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Administration — live read

**Protocol Admin Safe:** `0xE6D0846e6C0b51C61FdDb593A1914b85181E5783` (Safe v1.4.1)

| Property | Value |
|---|---|
| Owner 1 | `0x7ec76611Da0AeE7C1B11273E9767FDA1Faa31790` |
| Owner 2 | `0xD83deFbA240568040b39bb2C8B4DB7dB02d40593` |
| **Threshold** | **1 of 2** |

All nine ownable contracts return the Safe as `owner()`.

> **Governance finding.** A 1-of-2 threshold means either owner acting alone holds full
> protocol admin authority: pause/unpause, and the one-time authority slots. Owner 2 is
> the same key as `DEPLOYER_PRIVATE_KEY`, which is present in plaintext in the local
> `.env`. This is functionally single-EOA control. The deployment manifest itself records
> `governanceTransition: "RAISE_THRESHOLD_TO_2_PLUS"` as outstanding.
> **Do not describe this deployment as decentralised.**

Deployer: `0xD83deFbA240568040b39bb2C8B4DB7dB02d40593`.

## Wiring — one-time slots, confirmed consumed

| Call | Target | Argument |
|---|---|---|
| `setFactory` | LaunchRegistry | PassFactory |
| `setInitializer` | AdvantageRegistry | AdvantageInitializer |
| `setAdvantageInitializer` | MintController | AdvantageInitializer |
| `setListingRegistry` | RoyaltyVault | ListingRegistry |
| `setZone` | ListingRegistry | MarketsZone |
| `setListingAuthority` | AdvantageRegistry | ListingRegistry |

Each slot is single-assignment and reverts on reuse.

## Indexer

- **Provider:** Goldsky
- **Subgraph:** `nexmarkets-v1-base-sepolia/1.0.1` (same tag, redeployed against the new
  address set; the endpoint URL is therefore unchanged)
- **Start block:** `46,827,960`
- Watches all eleven contract addresses above, including `NexRewardDistributor`.
- `MintAccessPublished` gained `walletAllowance`, which changes the event topic. The
  manifest signature, `schema.graphql`, the handler and the generated ABIs were updated
  together — a partial update would have indexed no mint access at all, silently.

## Deployment readiness gates — as recorded in `config.json`

All six gates are currently **false**:

`databaseMigrationVerified`, `contractConfigVerified`, `paymentTokenVerified`,
`testnetE2EPassed`, `securityGatePassed`, `criticalTestsPassed`

`productionReady: false`, `certificationEdition: null` for Base Sepolia.

---

## ✅ The fixed contracts are deployed

Both S1 defects are closed **on chain**, not only in source. Verified by live read:

| Check | Result |
|---|---|
| `NexPassAccount.listingRegistry()` | `0x21C397F2…` — the current `NexListingRegistry` |
| `NexTBAResolver.implementationRuntimeCodeHash()` | `0x56d07999…`, equal to the deployed account codehash |
| `NexRewardDistributor` runtime | `0x2453c5FC…` has the planned `0x14012413…` runtime hash |
| `NexMintController.allowlistRemaining(...)` | Present; reverts `EditionNotRegistered`, a domain error, not a missing selector |
| `scripts/verify-v1-deployment.mjs --post-wire` | `PASS`, `oneTimeSlots: WIRED_AND_VERIFIED` |
| `scripts/verify-production-config.mjs` | `PASS` |

### How it was deployed without editing the frozen constants

The reproducibility control in `scripts/deployment-source.mjs` was **not** modified.
`FROZEN_V1_DEPLOYMENT_SOURCE` and `FROZEN_V1_CREATION_BYTECODE_HASHES` are unchanged.

That gate is a **mainnet** control. `plan-v1-deployment.mjs` accepts `--unfrozen-dev`
and `build-v1-safe-bundles.mjs` accepts `--allow-unfrozen-testnet`, both explicitly
scoped to `base-sepolia` and `robinhood-testnet`. The previous Base Sepolia deployment
had already used this path — its recorded `deploymentSourceCommit` was `7bb4d1f7…`,
which is not the frozen commit. So no compliance control needed overriding.

The contract fixes were committed **before** planning, so the deployment's
`sourceCommit` (`c7622359…`) is source that actually contains the reward graph and
deployment tooling. In `--unfrozen-dev`
mode the salt embeds that commit, so deploying from a dirty working tree would have
produced a permanent record citing a commit without the fixes.

### Two tooling defects found and fixed en route

Both would have reverted on chain, and the planner reported `PASS` while emitting the
broken plan:

1. `NexPassAccount` gained an immutable constructor argument, but the planner still
   encoded no arguments. The tell was `initCodeHash == creationBytecodeHash`. The
   constructor would have reverted `ListingRegistryRequired`.
2. That immutable makes the account's runtime codehash network-specific, so the pin in
   `deployments/erc6551.base-sepolia.json` was stale and `NexTBAResolver` would have
   reverted `InvalidCodeHash`. The planner now materializes the immutable to derive the
   pin and fails closed on a mismatch.

`scripts/simulate-v1-deployment.mjs` was added to execute a generated plan against a
fork before it costs gas or consumes the one-time wiring slots, which cannot be replayed.

### Pass Vault address reset — nothing needed migrating

Replacing `NexPassAccount` changes every ERC-6551 Vault address. That was free here:
a full scan of every block since the original deployment found **2 Editions and zero
minted Passes** (`totalMinted() == 0` on both), zero `NexTBAResolver` events, and no
balance on the old implementation. No Vault had ever existed, so no value moved.

### Superseded pre-fix addresses

| Contract | Superseded address |
|---|---|
| NexLaunchRegistry | `0x707278D3a69e27bde2A14Ee70602d4A293C8C2aF` |
| NexMintController | `0xe68Fc831a441eeA79865A890a279514C8C797677` |
| NexPassFactory | `0xc5Cdfcc91719379A778C16b2ab9190c004186E0C` |
| NexAdvantageRegistry | `0xddf778F46b1A91f7B80B24fdB185372C633Acb15` |
| NexAdvantageInitializer | `0xc9F984509Eca22D9D4FbF4f607EE1A3C4EeE3A40` |
| NexRoyaltyVault | `0x1C7fBa2bEfdCB18E316e1713fc22EaC78434DBF3` |
| NexListingRegistry | `0xdB57a21e01d85E67d75111534e3A99508e1e9187` |
| NexMarketsZone | `0x1C7e6cE890d9c6DD9DF55f42449f9F2F34141B3e` |
| NexPassAccount | `0xCD03b7d726601825777f1435D5115F9727a1BdA6` |
| NexTBAResolver | `0xbe6B893d99D53F44Bd67Ac1775fdbc74039B8C99` |

### Still outstanding

- **Mainnet** has no unfrozen path. Going to `base-mainnet` still requires the real V2
  release decision and a `FROZEN_V2_*` re-freeze.
- The `expectedBuildRuntimeCodeHash` pins in the other three `deployments/erc6551.*.json`
  files are now stale, so the planner fails closed on those networks until re-pinned.
- `subgraph/subgraph.yaml` (robinhood-testnet) still declares the five-parameter
  `MintAccessPublished` while sharing the regenerated six-parameter ABIs, so it will not
  rebuild until reconciled.
