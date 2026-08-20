-- Historical Phase 0 authority base; applied by the production migration runner before 0002.
CREATE TABLE IF NOT EXISTS chain_transaction (
  id text PRIMARY KEY,
  chain_id bigint NOT NULL,
  intent_type text NOT NULL,
  intent_id text NOT NULL,
  wallet_address text NOT NULL,
  state text NOT NULL CHECK (state IN ('PREPARED','WALLET_PENDING','SUBMITTED','CONFIRMED','FINALIZED','CANCELLED','REVERTED','REORGED')),
  tx_hash text,
  block_number bigint,
  block_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id, intent_type, intent_id)
);

CREATE TABLE IF NOT EXISTS wallet_challenge (
  nonce text PRIMARY KEY,
  account_id text NOT NULL,
  wallet_address text NOT NULL,
  origin text NOT NULL,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE IF NOT EXISTS reconciliation_incident (
  id text PRIMARY KEY,
  authority text NOT NULL,
  object_key text NOT NULL,
  severity text NOT NULL,
  expected jsonb,
  observed jsonb,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
