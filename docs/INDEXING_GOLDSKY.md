# Goldsky indexing

Goldsky is the only production indexer for NexMarkets V1. The preferred flow is Goldsky Turbo → PostgreSQL → API → UI. There is no bespoke RPC polling loop and The Graph is not the primary provider.

After Goldsky assigns the dedicated Robinhood dataset prefix, set `GOLDSKY_ROBINHOOD_MAINNET_DATASET_PREFIX` or `GOLDSKY_ROBINHOOD_TESTNET_DATASET_PREFIX` and run `npm run goldsky:render -- --mainnet` (omit the flag for testnet). The renderer materializes the pinned event-topic allowlist without embedding database credentials. Candidate ERC-721/Advantage events are transported by topic, but the projector accepts them only after `NexPassFactory.EditionCreated` dynamically registers the Edition address.

Robinhood is EVM-compatible but is not currently published in Goldsky's shared-chain list. Goldsky must enable dedicated datasets for chain IDs 4663 and 46630 and provide dataset slugs. Replace `__ROBINHOOD_DATASET_PREFIX__` in `goldsky/nexmarkets-robinhood.turbo.yaml` only with the assigned slug. Do not commit the Goldsky API key or PostgreSQL sink secret.

The pipeline ingests raw logs/blocks and upserts by `(chain_id, transaction_hash, log_index)`. The event catalog covers Factory discovery, Registry Terms/edition changes, primary settlement and noncanonical referral hints, dynamic Edition mint/Transfer events, Advantage state, listing state, Vault claims, ERC-6551 account creation and Seaport fulfillment. Factory `EditionCreated` drives dynamic Edition discovery.

Every event retains chain ID, block number/hash, transaction hash, log index, address, signature, timestamp, finality and orphan status. Context-free Listing status events resolve `orderHash` through `listing_projection`; royalty withdrawals resolve through `royalty_claim_projection`; ERC-6551 events use `tokenContract`; Seaport `OrderFulfilled` is retained as settlement evidence. Backfills start at `earliest`; resumability comes from Goldsky plus `indexer_checkpoint`. Reorged blocks are orphaned and affected entities replay from the retained non-orphaned event journal, including same tx/log re-inclusion under a replacement block hash. Referral hints are stored only as qualification inputs.

Run `npm run verify:goldsky`. A PASS validates the committed template/catalog; it does not claim the external Goldsky pipeline is deployed or healthy. Operations must monitor Goldsky pipeline lag, latest indexed/finalized block and sink failures.
# Runtime projection boundary

Goldsky Turbo is the sole production indexer. Its Robinhood dataset lands
`goldsky_raw_log`; `services/indexer/src/run.mjs` is the required Postgres
projection consumer, not a replacement RPC polling indexer. It ABI-decodes the
pinned event catalog, admits Editions only through durable Factory requests,
persists complete Terms/Advantage definitions, writes provenance-bearing
projections, handles `removed`/reorg records, and updates indexed/finalized
checkpoints. It is resumable and idempotent by `(chain_id,tx_hash,log_index)`.

Goldsky must first enable the dedicated Robinhood dataset and provide the
Postgres sink secret; those are external release gates. Never commit either
secret.
