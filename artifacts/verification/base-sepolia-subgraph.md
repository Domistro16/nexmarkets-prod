# Base Sepolia subgraph verification

Deployment: `nexmarkets-v1-base-sepolia/1.0.1`

Goldsky reports the deployment as **healthy (Active)** and **Synced: 100%**.

| Field | Value |
|---|---|
| Network | Base Sepolia |
| Chain ID | 84532 |
| Endpoint | https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-base-sepolia/1.0.1/gn |
| Datasource | NexLaunchRegistry `0x707278D3a69e27bde2A14Ee70602d4A293C8C2aF`; NexMintController `0xe68Fc831a441eeA79865A890a279514C8C797677`; NexPassFactory `0xc5Cdfcc91719379A778C16b2ab9190c004186E0C`; NexAdvantageRegistry `0xddf778F46b1A91f7B80B24fdB185372C633Acb15`; NexListingRegistry `0xdB57a21e01d85E67d75111534e3A99508e1e9187`; NexRoyaltyVault `0x1C7fBa2bEfdCB18E316e1713fc22EaC78434DBF3`; NexMarketsZone `0x1C7e6cE890d9c6DD9DF55f42449f9F2F34141B3e` |
| Start block | 46598681 |
| Deployment timestamp | 2026-09-09 16:21:59 Africa/Lagos (Goldsky CLI) |
| Indexed block observed | 46600975 (readiness probe) |
| Chain head observed | 46600975 (readiness probe) |
| Lag | 0 blocks |
| Health | healthy / Active |

## Sample queries

The endpoint returned `_meta.block.number = 46600863` during the fresh Terms check and returned the fresh Edition:

- Edition: `0xa83a555e4e087ddf261c7ab3cffdff877c83a0fd`
- Edition ID: `0x965ea73e9f7cfa0bb0fd2d6da0da9a7180f80e314eac4b2151fc4947636f7d52`
- publisher: `0xd83defba240568040b39bb2c8b4db7db02d40593`
- `currentTerms.version = 1`
- `currentTerms.hash = 0xba0bf9f922cf8846616472b5f44cd6e9983e868b8bf9955eff38ea038d363c5f`
- `currentTerms.pricePerPass = 1000000` USDC base units
- `totalMinted = 0` (mint is correctly scheduled after the 24-hour Preview)

Pass, ownership, listing and sale entities are empty for this new Edition until
the scheduled Debut is open. The API successfully consumes the same endpoint,
and `/readyz` returned HTTP 200 with `indexerProvider=GOLDSKY_SUBGRAPH`, zero
observed lag, and the Base chain head.
