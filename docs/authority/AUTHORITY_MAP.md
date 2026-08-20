# Canonical Authority Map

| State | Canonical authority |
|---|---|
| Pass owner | ERC-721 `ownerOf` |
| Exact serial | ERC-721 token ID |
| Minted supply | Robinhood Chain |
| Mint intent | `NexMintController` |
| Primary USDG settlement | Robinhood Chain |
| Terms / Preview | `NexLaunchRegistry` |
| Project content | PostgreSQL |
| Media bytes | Object storage |
| Exact artwork mapping | Edition content commitment |
| Remaining Advantage | `NexAdvantageRegistry` |
| Seaport fill/cancel | Seaport |
| NexMarkets listing policy | `NexListingRegistry` |
| Secondary ownership transfer | ERC-721 via Seaport |
| Builder Royalty lock | `NexRoyaltyVault` |
| Referral attribution | PostgreSQL referral ledger |
| Token-bound account address/control | Canonical ERC-6551 Registry + ERC-721 `ownerOf` |
| Indexed/read-model rows | Goldsky Turbo -> PostgreSQL mirror |
| Transaction status | Chain receipt/finality lifecycle, projected to PostgreSQL |

The TBA is an attachment capability, not ownership, Terms, serial, Advantage,
listing or royalty authority. Goldsky is the indexer and PostgreSQL is the
read-model/referral/product authority described above. Goldsky, PostgreSQL
chain projections, reconciliation caches and the UI may never override chain
truth.
