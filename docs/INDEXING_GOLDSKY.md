# Goldsky indexing

Goldsky Subgraph is the primary NexMarkets V1 blockchain read model. The
architecture is:

`Robinhood Chain → Goldsky Subgraph → NexMarkets API → UI`

Robinhood Chain and the deployed contracts remain canonical. The Subgraph is
an indexed read model only; the API uses Robinhood RPC for owner, Terms,
Advantage, listing, TBA, receipt, finality and reconciliation checks. Supabase
stores application data and transaction lifecycle state, not raw chain blocks
or logs.

## Testnet deployment

Goldsky's authenticated CLI project is the active account project selected for
this testnet deployment (`Default Project`; its public project ID is recorded
in `deployments/robinhood-testnet.goldsky-subgraph.json`). The local package is
`subgraph/` and uses the supported Robinhood testnet network identifier
`robinhood-testnet`, chain ID `46630`, and start block `104607055` (the first
recorded NexMarkets deployment block). Deploy only through Goldsky:

```text
cd subgraph
npm run codegen
npm run build
goldsky subgraph deploy nexmarkets-v1-robinhood-testnet/1.0.0 --path .
goldsky subgraph list nexmarkets-v1-robinhood-testnet/1.0.0
goldsky subgraph log nexmarkets-v1-robinhood-testnet/1.0.0
```

`graph codegen` and `graph build` are local validation tools only. Do not use
`graph deploy`, Graph Studio, a graph-node endpoint or a Graph Network deploy
key. The returned Goldsky GraphQL endpoint is configured as
`NEXMARKETS_SUBGRAPH_URL` for the API and reconciler.

The manifest statically indexes the V1 registries and primitives and creates a
dynamic `NexPassEdition` data source from every Factory `EditionCreated` event.
The certification Edition is therefore discovered from chain history rather
than hardcoded as the production indexing mechanism.

## Turbo transition

The former Goldsky Turbo → raw PostgreSQL pipeline is retained as rollback and
archive infrastructure but is deprecated for the NexMarkets V1 primary read
model. Do not add product dependencies on `goldsky_raw_log` or
`goldsky_chain_watermark`. Turbo may later serve analytics, exports or raw
archival workloads. It is not authoritative and must not replace the
Subgraph/RPC path.

The old tables are not deleted automatically. Before cleanup, generate a
report of row counts, sizes, runtime references and safe-removal gates. Delete
only after `SUBGRAPH_READ_PATH_PASS`, `RPC_RECONCILIATION_PASS` and
`TESTNET_SUBGRAPH_CERTIFICATION_PASS` are all evidenced.

## Readiness and reconciliation

`/readyz` reads the Subgraph `_meta.block.number` and compares it with the
current Robinhood RPC head. The latest NexMarkets event is not used as a
progress watermark. Reconciliation compares independent Subgraph entities
(Edition, Pass, Advantage, Listing, Royalty claim and TBA) against RPC and
records discrepancies without overwriting chain truth.

## Secrets and mainnet

Never commit `GOLDSKY_API_KEY`, `DATABASE_URL` or the Subgraph endpoint if it
contains credentials. Mainnet remains separately configured; its start block
is unresolved until custom NexMarkets mainnet deployment occurs. No mainnet
deployment is implied by the testnet Subgraph.
