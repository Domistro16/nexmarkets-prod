# Indexer

Goldsky Turbo writes only raw logs. `src/run.mjs` is the production Postgres-backed second stage: it decodes the pinned 22-event ABI catalog, dynamically admits Factory Editions through durable Builder requests, writes `indexer_event` and all chain projections, persists Advantage definitions from the exact Terms commitment, handles removed/reorged logs, advances finality, and resumes from `indexer_checkpoint` idempotently. It never replaces chain authority.

Run `npm --workspace @nexmarkets/indexer run once` for a bounded batch or `npm --workspace @nexmarkets/indexer start` for the resumable worker. Goldsky remains the sole production indexer; this process is the deterministic projection sink/consumer, not an RPC polling replacement.
