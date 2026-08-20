-- NexMarkets V1 production schema.
-- IMPORTANT: tables suffixed or described as projections mirror chain truth.
-- They must never override the canonical onchain authorities in AUTHORITY_MAP.md.

CREATE TABLE IF NOT EXISTS schema_migration (
  version text PRIMARY KEY,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account (
  id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES account(id),
  chain_id bigint NOT NULL CHECK (chain_id IN (4663,46630)),
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  verified_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id,address)
);

ALTER TABLE wallet_challenge ADD COLUMN IF NOT EXISTS chain_id bigint;
ALTER TABLE wallet_challenge ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE wallet_challenge ADD COLUMN IF NOT EXISTS issued_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE wallet_challenge ADD COLUMN IF NOT EXISTS signature text;

CREATE TABLE IF NOT EXISTS app_session (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES account(id),
  wallet_id text NOT NULL REFERENCES wallet(id),
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project (
  id text PRIMARY KEY,
  builder_account_id text NOT NULL REFERENCES account(id),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edition (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES project(id),
  chain_id bigint NOT NULL CHECK (chain_id IN (4663,46630)),
  edition_address text NOT NULL CHECK (edition_address ~ '^0x[0-9a-f]{40}$'),
  edition_id_hash text NOT NULL,
  factory_address text NOT NULL,
  publisher_address text NOT NULL,
  absolute_supply_cap integer NOT NULL CHECK (absolute_supply_cap > 0),
  artwork_commitment text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  source_block_number bigint NOT NULL,
  source_block_hash text NOT NULL,
  source_tx_hash text NOT NULL,
  source_log_index integer NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id,edition_address),
  UNIQUE(chain_id,source_tx_hash,source_log_index)
);

CREATE TABLE IF NOT EXISTS terms_version (
  id text PRIMARY KEY,
  edition_id text NOT NULL REFERENCES edition(id),
  version bigint NOT NULL CHECK (version > 0),
  terms_hash text NOT NULL,
  active_supply numeric(78,0) NOT NULL CHECK (active_supply > 0),
  price_usdg numeric(78,0) NOT NULL CHECK (price_usdg > 0),
  preview_starts_at timestamptz NOT NULL,
  mint_starts_at timestamptz NOT NULL,
  mint_ends_at timestamptz NOT NULL,
  primary_recipient text NOT NULL,
  royalty_receiver text NOT NULL,
  royalty_bps integer NOT NULL CHECK (royalty_bps BETWEEN 0 AND 500),
  advantages_hash text,
  referral_terms_hash text NOT NULL,
  source_block_number bigint NOT NULL,
  source_block_hash text NOT NULL,
  source_tx_hash text NOT NULL,
  source_log_index integer NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(edition_id,version),
  UNIQUE(edition_id,terms_hash),
  UNIQUE(source_tx_hash,source_log_index)
);

-- ERC-721 ownership and minted supply remain canonical on Robinhood Chain.
CREATE TABLE IF NOT EXISTS pass_token_projection (
  edition_id text NOT NULL REFERENCES edition(id),
  token_id numeric(78,0) NOT NULL,
  owner_address text NOT NULL,
  terms_hash text NOT NULL,
  token_bound_account text,
  minted_block_number bigint NOT NULL,
  latest_block_number bigint NOT NULL,
  latest_block_hash text NOT NULL,
  latest_tx_hash text NOT NULL,
  latest_log_index integer NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(edition_id,token_id),
  UNIQUE(latest_tx_hash,latest_log_index)
);

CREATE TABLE IF NOT EXISTS serial_artwork (
  edition_id text NOT NULL REFERENCES edition(id),
  token_id numeric(78,0) NOT NULL,
  asset_id text NOT NULL,
  leaf_hash text NOT NULL,
  proof jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(edition_id,token_id),
  UNIQUE(edition_id,asset_id)
);

CREATE TABLE IF NOT EXISTS advantage_definition (
  id text PRIMARY KEY,
  edition_id text NOT NULL REFERENCES edition(id),
  terms_hash text NOT NULL,
  advantage_id_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('TIME_BASED','QUANTITY_BASED','CONNECTED','REDEMPTION')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  total_units numeric(78,0) NOT NULL DEFAULT 0,
  definition_hash text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(edition_id,terms_hash,advantage_id_hash)
);

-- Projection only; remaining Advantage is canonical in NexAdvantageRegistry.
CREATE TABLE IF NOT EXISTS advantage_state_projection (
  edition_id text NOT NULL REFERENCES edition(id),
  token_id numeric(78,0) NOT NULL,
  advantage_id_hash text NOT NULL,
  remaining_units numeric(78,0) NOT NULL,
  frozen_seconds bigint NOT NULL DEFAULT 0,
  listed boolean NOT NULL DEFAULT false,
  source_block_number bigint NOT NULL,
  source_block_hash text NOT NULL,
  source_tx_hash text NOT NULL,
  source_log_index integer NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(edition_id,token_id,advantage_id_hash),
  UNIQUE(source_tx_hash,source_log_index)
);

CREATE TABLE IF NOT EXISTS mint_intent (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES account(id),
  chain_id bigint NOT NULL,
  edition_address text NOT NULL,
  terms_hash text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  recipient_address text NOT NULL,
  referral_hint text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,idempotency_key)
);

ALTER TABLE chain_transaction ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE chain_transaction ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE chain_transaction ADD COLUMN IF NOT EXISTS confirmations integer NOT NULL DEFAULT 0;
ALTER TABLE chain_transaction ADD COLUMN IF NOT EXISTS finalized_at timestamptz;
ALTER TABLE chain_transaction ADD COLUMN IF NOT EXISTS failure_code text;
ALTER TABLE chain_transaction DROP CONSTRAINT IF EXISTS chain_transaction_chain_id_intent_type_intent_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chain_transaction_wallet_intent
  ON chain_transaction(chain_id,wallet_address,intent_type,intent_id);

CREATE TABLE IF NOT EXISTS transaction_event (
  event_id text PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES chain_transaction(id),
  from_state text NOT NULL,
  to_state text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_job (
  id text PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES chain_transaction(id),
  job_type text NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  UNIQUE(transaction_id,job_type)
);

-- Listing policy is canonical in NexListingRegistry; execution evidence is canonical in Seaport.
CREATE TABLE IF NOT EXISTS listing_projection (
  order_hash text PRIMARY KEY,
  edition_id text NOT NULL REFERENCES edition(id),
  token_id numeric(78,0) NOT NULL,
  seller_address text NOT NULL,
  terms_hash text NOT NULL,
  price_usdg numeric(78,0) NOT NULL,
  protocol_fee_usdg numeric(78,0) NOT NULL,
  royalty_usdg numeric(78,0) NOT NULL,
  seller_proceeds_usdg numeric(78,0) NOT NULL,
  zone_hash text NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE','CANCELLED','FILLED','EXPIRED','STALE')),
  source_block_number bigint NOT NULL,
  source_block_hash text NOT NULL,
  source_tx_hash text NOT NULL,
  source_log_index integer NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_tx_hash,source_log_index)
);

CREATE TABLE IF NOT EXISTS listing_event (
  id text PRIMARY KEY,
  order_hash text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','CANCELLED','FILLED','EXPIRED','STALE','SEAPORT_FULFILLED')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  chain_id bigint NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id,tx_hash,log_index)
);

-- Seller-authorized Seaport payload. This enables fulfillment but never overrides
-- ListingRegistry status or Seaport fill/cancel authority.
CREATE TABLE IF NOT EXISTS signed_seaport_order (
  order_hash text PRIMARY KEY,
  chain_id bigint NOT NULL CHECK (chain_id IN (4663,46630)),
  seller_address text NOT NULL,
  order_payload jsonb NOT NULL,
  counter numeric(78,0) NOT NULL,
  signature text NOT NULL,
  submitted_by_account_id text NOT NULL REFERENCES account(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (signature ~ '^0x[0-9a-fA-F]+$')
);

-- Projection only; claim release and withdrawal authority remain in NexRoyaltyVault.
CREATE TABLE IF NOT EXISTS royalty_claim_projection (
  order_hash text PRIMARY KEY,
  edition_id text NOT NULL REFERENCES edition(id),
  token_id numeric(78,0) NOT NULL,
  builder_address text NOT NULL,
  amount_usdg numeric(78,0) NOT NULL CHECK (amount_usdg > 0),
  release_at timestamptz NOT NULL,
  withdrawn boolean NOT NULL DEFAULT false,
  withdrawn_tx_hash text,
  source_block_number bigint NOT NULL,
  source_block_hash text NOT NULL,
  source_tx_hash text NOT NULL,
  source_log_index integer NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_tx_hash,source_log_index)
);

CREATE TABLE IF NOT EXISTS referral_account (
  id text PRIMARY KEY,
  account_id text NOT NULL UNIQUE REFERENCES account(id),
  code text NOT NULL UNIQUE,
  qualified_sales integer NOT NULL DEFAULT 0,
  tier_percent integer NOT NULL DEFAULT 5 CHECK (tier_percent IN (5,10,15,20)),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_attribution (
  id text PRIMARY KEY,
  referral_account_id text NOT NULL REFERENCES referral_account(id),
  referred_account_id text NOT NULL REFERENCES account(id),
  edition_id text REFERENCES edition(id),
  mint_intent_id text REFERENCES mint_intent(id),
  evidence jsonb NOT NULL,
  qualified_at timestamptz,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referral_account_id <> referred_account_id),
  UNIQUE(referred_account_id,edition_id)
);

CREATE TABLE IF NOT EXISTS referral_settlement (
  id text PRIMARY KEY,
  referral_account_id text NOT NULL REFERENCES referral_account(id),
  builder_account_id text NOT NULL REFERENCES account(id),
  attribution_id text NOT NULL REFERENCES referral_attribution(id),
  amount_usdg numeric(78,0) NOT NULL CHECK (amount_usdg >= 0),
  tier_percent integer NOT NULL CHECK (tier_percent IN (5,10,15,20)),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PREPARED','BUILDER_APPROVED','SETTLED','VOID')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification (
  id text PRIMARY KEY,
  account_id text REFERENCES account(id),
  type text NOT NULL,
  business_key text NOT NULL,
  payload jsonb NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(type,business_key,account_id)
);

ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_type_business_key_account_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_business_account
  ON notification(type,business_key,account_id) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS outbox_event (
  id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  business_key text NOT NULL,
  payload jsonb NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  dead_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_type,business_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id text PRIMARY KEY,
  actor_account_id text REFERENCES account(id),
  actor_wallet_address text,
  action text NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  request_id text,
  correlation_id text,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexer_event (
  chain_id bigint NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  contract_address text NOT NULL,
  event_signature text NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  block_timestamp timestamptz NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  orphaned_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(chain_id,tx_hash,log_index)
);

-- Goldsky Turbo landing table. Decoding/projecting into indexer_event is
-- idempotent and validates dynamic Edition addresses against Factory events.
CREATE TABLE IF NOT EXISTS goldsky_raw_log (
  chain_id bigint NOT NULL,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  transaction_hash text NOT NULL,
  log_index integer NOT NULL,
  contract_address text NOT NULL,
  topic0 text NOT NULL,
  topics jsonb NOT NULL,
  data text NOT NULL,
  block_timestamp timestamptz NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(chain_id,transaction_hash,log_index)
);

CREATE TABLE IF NOT EXISTS indexer_checkpoint (
  pipeline text NOT NULL,
  chain_id bigint NOT NULL,
  latest_block_number bigint NOT NULL,
  latest_block_hash text NOT NULL,
  finalized_block_number bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(pipeline,chain_id)
);

CREATE TABLE IF NOT EXISTS reconciliation_run (
  id text PRIMARY KEY,
  chain_id bigint NOT NULL,
  scope text NOT NULL,
  from_block bigint,
  to_block bigint,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','PARTIAL')),
  checked_count integer NOT NULL DEFAULT 0,
  discrepancy_count integer NOT NULL DEFAULT 0,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE reconciliation_incident ADD COLUMN IF NOT EXISTS run_id text REFERENCES reconciliation_run(id);
ALTER TABLE reconciliation_incident ADD COLUMN IF NOT EXISTS repair_action text;
ALTER TABLE reconciliation_incident ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS media_asset (
  id text PRIMARY KEY,
  owner_account_id text NOT NULL REFERENCES account(id),
  project_id text REFERENCES project(id),
  storage_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL,
  safety_status text NOT NULL CHECK (safety_status IN ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(owner_account_id,sha256)
);

CREATE INDEX IF NOT EXISTS idx_pass_owner ON pass_token_projection(owner_address) WHERE orphaned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listing_active ON listing_projection(status,expires_at) WHERE orphaned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_royalty_builder ON royalty_claim_projection(builder_address,release_at) WHERE withdrawn = false;
CREATE INDEX IF NOT EXISTS idx_outbox_ready ON outbox_event(available_at) WHERE delivered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_indexer_block ON indexer_event(chain_id,block_number) WHERE orphaned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goldsky_raw_block ON goldsky_raw_log(chain_id,block_number);
CREATE INDEX IF NOT EXISTS idx_reconciliation_open ON reconciliation_incident(status,authority);
