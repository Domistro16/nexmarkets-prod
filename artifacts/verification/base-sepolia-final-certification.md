# Base Sepolia final certification evidence

Network: Base Sepolia (`84532`), configured settlement token: canonical USDC
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

The fresh Edition and Terms publication were executed against the current
permissionless Base deployment. The protocol enforces a one-day Preview before
minting; therefore the acquisition/listing rows remain scheduled until the
chain's `mintStartsAt` (`2026-09-10T16:08:27Z`). No transaction was fabricated
for a not-yet-open Debut.

| Action | Chain | Contract | Tx/order hash | Block | Result |
|---|---|---|---|---:|---|
| Edition creation | Base Sepolia | NexPassFactory `0xc5Cdfcc91719379A778C16b2ab9190c004186E0C` | `0x570f25b53b2582ebf80b0f18edb68fa2f75f0c97aebcec0fb9c630cd5e4ec734` | 46600758 | PASS; Edition `0xa83a555e4e087ddf261c7ab3cffdff877c83a0fd` |
| Terms publication | Base Sepolia | NexLaunchRegistry `0x707278D3a69e27bde2A14Ee70602d4A293C8C2aF` | `0x0009ba6aa55133c62b8c806f0c84b55f6b62e897ea7e23b18941837a3240b0b2` | 46600853 | PASS; Terms version 1; hash `0xba0bf9f9…d363c5f` |
| Primary acquisition | Base Sepolia | NexMintController `0xe68Fc831a441eeA79865A890a279514C8C797677` | — | — | SCHEDULED; rejected before `mintStartsAt` by protocol |
| Advantage use | Base Sepolia | NexAdvantageRegistry `0xddf778F46b1A91f7B80B24fdB185372C633Acb15` | — | — | SCHEDULED after mint |
| Listing | Base Sepolia | NexListingRegistry `0xdB57a21e01d85E67d75111534e3A99508e1e9187` | — | — | SCHEDULED after mint |
| Change-price old order | Base Sepolia | Seaport / Listing Registry | — | — | SCHEDULED; replacement workflow implemented |
| Change-price new order | Base Sepolia | Seaport / Listing Registry | — | — | SCHEDULED; replacement workflow implemented |
| Delist | Base Sepolia | NexListingRegistry `0xdB57a21e01d85E67d75111534e3A99508e1e9187` | — | — | SCHEDULED after listing |
| Relist | Base Sepolia | Seaport / Listing Registry | — | — | SCHEDULED after delist |
| Secondary purchase | Base Sepolia | Seaport `0x0000000000000068F116a894984e2DB1123eB395` | — | — | SCHEDULED after relist |

The live chain blocker is the immutable 24-hour Preview rule in the deployed
LaunchRegistry, not an application fallback. `/readyz` and Goldsky reconciliation
are green while the Edition is in Preview.
