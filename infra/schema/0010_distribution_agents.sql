-- Dynamic Server Wallets for autonomous reward distribution agents.
-- Tracks scoped server wallets, cadence triggers, and execution history.

CREATE TABLE IF NOT EXISTS distribution_agent (
  id text PRIMARY KEY,
  edition_address text NOT NULL CHECK (edition_address ~ '^0x[0-9a-f]{40}$'),
  builder_address text NOT NULL CHECK (builder_address ~ '^0x[0-9a-f]{40}$'),
  policy_id text NOT NULL,
  server_wallet_id text NOT NULL,
  server_wallet_address text NOT NULL CHECK (server_wallet_address ~ '^0x[0-9a-f]{40}$'),
  reward_source text NOT NULL DEFAULT 'BUILDER_ROYALTY' CHECK (reward_source IN ('BUILDER_ROYALTY', 'PRIMARY_SALES', 'OTHER_BUILDER_REVENUE', 'BUILDER_FUNDED', 'PLATFORM_FEE')),
  allocation_bps integer NOT NULL DEFAULT 3000 CHECK (allocation_bps >= 0 AND allocation_bps <= 10000),
  cadence_days integer NOT NULL DEFAULT 30 CHECK (cadence_days > 0),
  last_distribution_at timestamptz,
  next_distribution_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(edition_address, policy_id)
);

CREATE INDEX IF NOT EXISTS idx_distribution_agent_due ON distribution_agent(next_distribution_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_distribution_agent_edition ON distribution_agent(edition_address);

CREATE TABLE IF NOT EXISTS distribution_agent_log (
  id text PRIMARY KEY,
  agent_id text NOT NULL REFERENCES distribution_agent(id),
  cycle_id text NOT NULL,
  asset_address text NOT NULL CHECK (asset_address ~ '^0x[0-9a-f]{40}$'),
  eligible_supply integer NOT NULL CHECK (eligible_supply > 0),
  amount_per_pass numeric(78,0) NOT NULL CHECK (amount_per_pass > 0),
  total_funded numeric(78,0) NOT NULL CHECK (total_funded > 0),
  fund_tx_hash text NOT NULL,
  claim_tx_hashes text[] NOT NULL DEFAULT '{}',
  sweep_tx_hash text,
  status text NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('SUBMITTED', 'COMPLETED', 'FAILED')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dist_log_agent ON distribution_agent_log(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dist_log_cycle ON distribution_agent_log(cycle_id);
