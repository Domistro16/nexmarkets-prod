-- Complete the multi-Builder migration for relationships that were not part of
-- the original profile/project tables. Legacy account columns remain as
-- compatibility references; canonical ownership is builder_id.

ALTER TABLE builder_follow DROP CONSTRAINT IF EXISTS builder_follow_follower_account_id_builder_account_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_builder_follow_builder ON builder_follow(follower_account_id,builder_id);

-- Referral settlements may predate a Builder profile and therefore need a
-- durable identity before a user can own more than one Builder.
INSERT INTO builder(id, owner_account_id)
SELECT 'bld_' || md5('account:' || x.account_id), x.account_id
FROM (
  SELECT builder_account_id AS account_id FROM referral_settlement
) x
WHERE NOT EXISTS (SELECT 1 FROM builder b WHERE b.owner_account_id = x.account_id);

INSERT INTO builder_membership(builder_id, account_id, role)
SELECT b.id, b.owner_account_id, 'OWNER' FROM builder b
ON CONFLICT(builder_id, account_id) DO NOTHING;

ALTER TABLE referral_settlement ADD COLUMN IF NOT EXISTS builder_id text;
UPDATE referral_settlement rs
SET builder_id = p.builder_id
FROM referral_attribution ra
JOIN edition e ON e.id=ra.edition_id
JOIN project p ON p.id=e.project_id
WHERE rs.attribution_id=ra.id AND rs.builder_id IS NULL AND p.builder_id IS NOT NULL;
UPDATE referral_settlement rs
SET builder_id = b.id
FROM builder b
WHERE rs.builder_id IS NULL AND b.owner_account_id=rs.builder_account_id;
DO $$ BEGIN
  ALTER TABLE referral_settlement ADD CONSTRAINT referral_settlement_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_referral_settlement_builder ON referral_settlement(builder_id,status,created_at DESC);

DO $$ BEGIN
  ALTER TABLE builder_follow ALTER COLUMN builder_id SET NOT NULL;
EXCEPTION WHEN null_value_not_allowed THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE referral_settlement ALTER COLUMN builder_id SET NOT NULL;
EXCEPTION WHEN null_value_not_allowed THEN NULL; END $$;
