# Chain and subgraph state at freeze

This is a read-only inventory of the files and last recorded verification
observations. No RPC calls, deployments, migrations, or configuration writes
were performed for this handoff.

## Base Sepolia (current default testnet)

| Item | Current value |
|---|---|
| Network / chain ID | Base Sepolia / `84532` |
| RPC config name | `BASE_SEPOLIA_RPC_URL` (fallback `https://sepolia.base.org`) |
| Factory | NexPassFactory `0xc5Cdfcc91719379A778C16b2ab9190c004186E0C` |
| Edition implementation | Dynamic `NexPassEdition` template in the Factory; no separate implementation address is recorded in the deployment manifest |
| Mint Controller | `0xe68Fc831a441eeA79865A890a279514C8C797677` |
| Advantage Registry | `0xddf778F46b1A91f7B80B24fdB185372C633Acb15` |
| Advantage Initializer | `0xc9F984509Eca22D9D4FbF4f607EE1A3C4EeE3A40` |
| Listing Registry | `0xdB57a21e01d85E67d75111534e3A99508e1e9187` |
| Markets Zone | `0x1C7e6cE890d9c6DD9DF55f42449f9F2F34141B3e` |
| Seaport | `0x0000000000000068F116a894984e2DB1123eB395` (1.6) |
| Payment token | canonical Base Sepolia USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, 6 decimals |
| Royalty Vault | `0x1C7fBa2bEfdCB18E316e1713fc22EaC78434DBF3` |
| ERC-6551 Registry | `0x000000006551c19487814612e58FE06813775758` |
| Pass Account | `0xCD03b7d726601825777f1435D5115F9727a1BdA6` |
| TBA Resolver | `0xbe6B893d99D53F44Bd67Ac1775fdbc74039B8C99` |
| Deployment status | `DEPLOYED_WIRED_AND_VERIFIED_PERMISSIONLESS`; `runtimeReady: true` |
| Deployment manifest | `deployments/base-sepolia.v1-deployment.json` |
| Goldsky deployment | `nexmarkets-v1-base-sepolia/1.0.1` |
| Goldsky endpoint | `https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-base-sepolia/1.0.1/gn` |
| Subgraph datasource start | first protocol deployment block `46598681` (individual datasource starts are in `subgraph/subgraph.base-sepolia.yaml`) |
| Last recorded health | Goldsky **healthy / Active / Synced 100%** in `artifacts/verification/base-sepolia-subgraph.md` |
| Last recorded indexed block | `46600975` (readiness probe) |
| Last recorded chain head | `46600975` at that probe; a later RPC-only inspection saw head `46604093`, so no later subgraph lag was measured |
| Fresh Edition observed | `0xa83a555e4e087ddf261c7ab3cffdff877c83a0fd` |
| Fresh Edition creation tx | `0x570f25b53b2582ebf80b0f18edb68fa2f75f0c97aebcec0fb9c630cd5e4ec734` (block `46600758`) |
| Terms v1 tx / hash | `0x0009ba6aa55133c62b8c806f0c84b55f6b62e897ea7e23b18941837a3240b0b2` (block `46600853`) / `0xba0bf9f922cf8846616472b5f44cd6e9983e868b8bf9955eff38ea038d363c5f` |
| Live state at freeze | Terms published; mint scheduled after immutable 24-hour Preview (`mintStartsAt` `2026-09-10T16:08:27Z`); no Base Pass/listing/sale entities were created |

## Robinhood testnet (retained historical support, not default)

| Item | Current value |
|---|---|
| Network / chain ID | Robinhood testnet / `46630` |
| RPC config name | `RH_TESTNET_RPC_URL` (fallback `https://rpc.testnet.chain.robinhood.com`) |
| Factory | NexPassFactory `0x957DE0de07D33c9a89c791B876074657a7fFeEb6` |
| Edition implementation | Dynamic `NexPassEdition` template in the Factory; no separate implementation address is recorded |
| Mint Controller | `0x0ea6F883808447f115C7b6C037902361C365555A` |
| Advantage Registry | `0x1e265Fee39d75b5211895820926B4ff77B4f1cDd` |
| Advantage Initializer | `0x4024bB2A5134c2066E2FDE6fC3a1311e2234499A` |
| Listing Registry | `0xF8fD8D378F6a61Ecb207732F4f1d0c3E4Eb2c75c` |
| Markets Zone | `0xF21dA23d8928b320124fBc17bd678c7C48c55af6` |
| Seaport | `0x0000000000000068F116a894984e2DB1123eB395` (1.6) |
| Payment token | testnet-only MockUSDG `0x6A4F8832c23C51ba626Eba9d50c8F862647C1679`, 6 decimals |
| Royalty Vault | `0x9D69ab1897aFA9d6ffc97EEa6A936233a999DFa1` |
| ERC-6551 Registry | `0x000000006551c19487814612e58FE06813775758` |
| Pass Account | `0x1d687CE71479cFa3e626ed604c48d65fd86D7923` |
| TBA Resolver | `0x55b64D8c1f17ba08a39c939D3248E7A2731Fa8b8` |
| Deployment status | `DEPLOYED_WIRED_AND_VERIFIED`; retained historical certification deployment |
| Deployment manifest | `deployments/robinhood-testnet.v1-deployment.json` |
| Goldsky deployment | `nexmarkets-v1-robinhood-testnet/1.0.1` (hash `QmS7AYuDhFMgWUwngbtDcWvNWbDj56tvLGn2gZ2ZjrUb47`) |
| Goldsky endpoint | `https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn` |
| Subgraph start block | `104607055` |
| Last recorded index/lag | manifest observation `105228405` indexed vs `105228483` head, lag `78`; health `healthy`, status `ACTIVE_SYNCED` |
| Historical certification | Edition `0x4171D62F43B4168b07a01C04594455DBc3298437`; full historical lifecycle evidence remains in `artifacts/testnet-certification/secondary-lifecycle.json` |

## Mainnet

No Robinhood or Base mainnet NexMarkets deployments are configured as active
product deployments. Mainnet predicted/plan data remains non-deployed and is
outside this handoff's current testnet scope.
