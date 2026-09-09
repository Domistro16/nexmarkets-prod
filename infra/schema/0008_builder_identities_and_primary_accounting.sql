-- Builder identities are durable domain objects. An account may control
-- several Builders; account_id remains on legacy rows only as a compatibility
-- and migration reference.
CREATE TABLE IF NOT EXISTS builder (
  id text PRIMARY KEY,
  owner_account_id text NOT NULL REFERENCES account(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS builder_membership (
  builder_id text NOT NULL REFERENCES builder(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES account(id),
  role text NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER','EDITOR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(builder_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_builder_membership_account ON builder_membership(account_id, created_at);

-- Materialize one identity for every historical profile. The deterministic ID
-- makes a replayed migration preserve the same identity and profile links.
INSERT INTO builder(id, owner_account_id, created_at, updated_at)
SELECT 'bld_' || md5('profile:' || bp.id), bp.account_id, bp.created_at, bp.updated_at
FROM builder_profile bp
WHERE NOT EXISTS (SELECT 1 FROM builder b WHERE b.id = 'bld_' || md5('profile:' || bp.id));

-- Legacy social/project rows may predate a profile. Give those rows a stable
-- Builder identity as well so no historical record is orphaned.
INSERT INTO builder(id, owner_account_id)
SELECT 'bld_' || md5('account:' || x.account_id), x.account_id
FROM (
  SELECT builder_account_id AS account_id FROM project
  UNION SELECT builder_account_id FROM edition_request
  UNION SELECT builder_account_id FROM terms_advantage_commitment
  UNION SELECT builder_account_id FROM builder_follow
  UNION SELECT builder_account_id FROM builder_milestone
  UNION SELECT builder_account_id FROM builder_question
) x
WHERE NOT EXISTS (SELECT 1 FROM builder b WHERE b.owner_account_id = x.account_id);

INSERT INTO builder_membership(builder_id, account_id, role)
SELECT b.id, b.owner_account_id, 'OWNER' FROM builder b
ON CONFLICT(builder_id, account_id) DO NOTHING;

ALTER TABLE builder_profile ADD COLUMN IF NOT EXISTS builder_id text;
UPDATE builder_profile
SET builder_id = 'bld_' || md5('profile:' || builder_profile.id)
WHERE builder_id IS NULL;
ALTER TABLE builder_profile DROP CONSTRAINT IF EXISTS builder_profile_account_id_key;
DO $$ BEGIN
  ALTER TABLE builder_profile ADD CONSTRAINT builder_profile_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_builder_profile_builder ON builder_profile(builder_id);

ALTER TABLE project ADD COLUMN IF NOT EXISTS builder_id text;
ALTER TABLE edition_request ADD COLUMN IF NOT EXISTS builder_id text;
ALTER TABLE terms_advantage_commitment ADD COLUMN IF NOT EXISTS builder_id text;
ALTER TABLE builder_follow ADD COLUMN IF NOT EXISTS builder_id text;
ALTER TABLE builder_milestone ADD COLUMN IF NOT EXISTS builder_id text;
ALTER TABLE builder_question ADD COLUMN IF NOT EXISTS builder_id text;

-- Profile-specific identities are authoritative when available. Otherwise the
-- first migrated identity owned by the legacy account preserves old rows.
UPDATE project p SET builder_id = b.id
FROM builder b
WHERE p.builder_id IS NULL AND b.owner_account_id = p.builder_account_id
  AND b.id = COALESCE((SELECT bp.builder_id FROM builder_profile bp WHERE bp.account_id = p.builder_account_id LIMIT 1), b.id);
UPDATE edition_request r SET builder_id = b.id
FROM builder b
WHERE r.builder_id IS NULL AND b.owner_account_id = r.builder_account_id
  AND b.id = COALESCE((SELECT bp.builder_id FROM builder_profile bp WHERE bp.account_id = r.builder_account_id LIMIT 1), b.id);
UPDATE terms_advantage_commitment c SET builder_id = b.id
FROM builder b
WHERE c.builder_id IS NULL AND b.owner_account_id = c.builder_account_id
  AND b.id = COALESCE((SELECT bp.builder_id FROM builder_profile bp WHERE bp.account_id = c.builder_account_id LIMIT 1), b.id);
UPDATE builder_follow f SET builder_id = b.id
FROM builder b
WHERE f.builder_id IS NULL AND b.owner_account_id = f.builder_account_id
  AND b.id = COALESCE((SELECT bp.builder_id FROM builder_profile bp WHERE bp.account_id = f.builder_account_id LIMIT 1), b.id);
UPDATE builder_milestone m SET builder_id = b.id
FROM builder b
WHERE m.builder_id IS NULL AND b.owner_account_id = m.builder_account_id
  AND b.id = COALESCE((SELECT bp.builder_id FROM builder_profile bp WHERE bp.account_id = m.builder_account_id LIMIT 1), b.id);
UPDATE builder_question q SET builder_id = b.id
FROM builder b
WHERE q.builder_id IS NULL AND b.owner_account_id = q.builder_account_id
  AND b.id = COALESCE((SELECT bp.builder_id FROM builder_profile bp WHERE bp.account_id = q.builder_account_id LIMIT 1), b.id);

DO $$ BEGIN
  ALTER TABLE project ADD CONSTRAINT project_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE edition_request ADD CONSTRAINT edition_request_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE terms_advantage_commitment ADD CONSTRAINT terms_advantage_commitment_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE builder_profile ALTER COLUMN builder_id SET NOT NULL;
EXCEPTION WHEN null_value_not_allowed THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE builder_follow ADD CONSTRAINT builder_follow_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE builder_milestone ADD CONSTRAINT builder_milestone_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE builder_question ADD CONSTRAINT builder_question_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_project_builder ON project(builder_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_edition_request_builder ON edition_request(builder_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_terms_advantage_commitment_builder ON terms_advantage_commitment(builder_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_profile_builder ON builder_profile(builder_id);

-- Every confirmed PrimaryMintSettled event has one immutable accounting row.
-- Values are integer settlement-token units (USDG has 6 decimals on the
-- configured testnet and production deployments).
CREATE TABLE IF NOT EXISTS primary_sale_accounting (
  id text PRIMARY KEY,
  chain_id bigint NOT NULL,
  network text NOT NULL,
  tx_hash text NOT NULL,
  block_number bigint,
  event_index integer NOT NULL,
  edition_id text REFERENCES edition(id),
  edition_address text,
  terms_hash text,
  builder_id text REFERENCES builder(id),
  builder_account_id text REFERENCES account(id),
  buyer_address text,
  recipient_address text,
  first_token_id numeric(78,0),
  quantity integer NOT NULL CHECK (quantity > 0),
  gross_amount_usdg numeric(78,0) NOT NULL CHECK (gross_amount_usdg > 0),
  nexmarkets_fee_usdg numeric(78,0) NOT NULL CHECK (nexmarkets_fee_usdg >= 0),
  builder_proceeds_usdg numeric(78,0) NOT NULL CHECK (builder_proceeds_usdg >= 0),
  referral_obligation_usdg numeric(78,0) NOT NULL DEFAULT 0 CHECK (referral_obligation_usdg >= 0),
  payment_token text NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','FAILED','REORGED')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chain_id,tx_hash,event_index)
);

CREATE INDEX IF NOT EXISTS idx_primary_sale_builder ON primary_sale_accounting(builder_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_primary_sale_edition ON primary_sale_accounting(edition_id, status, created_at DESC);
