# PostgreSQL V1 data model

Migrations live in `infra/schema` and are checksum-locked after application. `0002_nexmarkets_v1.sql` adds accounts/wallets/sessions, projects, Editions, Terms versions, exact Pass projections, serial artwork, Advantages, transaction jobs, listings, seller-signed Seaport fulfillment payloads and settlement evidence, royalty claims, referral ledgers, notifications/outbox, audit logs, Goldsky ingestion/checkpoints, reconciliation and media metadata.

Tables named `*_projection` are mirrors. Ownership, minted supply, Terms, Advantage, listing and Vault state remain canonical onchain. Project content, sessions, referral attribution/settlement and media metadata are PostgreSQL authorities. All chain-derived rows retain block/transaction/log provenance, finality and reorg fields.

`signed_seaport_order` is a seller-authorized capability, not listing status. It is exposed for purchase only when joined to an active, non-orphaned `listing_projection`, and the API revalidates every exact token, recipient and amount before producing fulfillment calldata.

`infra/schema/migrate.mjs` applies migrations in one transaction and refuses to continue when an already-applied migration checksum changes. Run `DATABASE_URL=... npm run db:migrate`; CI runs it against PostgreSQL 17 before tests.
