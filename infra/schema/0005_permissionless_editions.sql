-- Permissionless Factory events are indexed without requiring an API-side
-- deployment request or an existing NexMarkets project record.
ALTER TABLE edition ALTER COLUMN project_id DROP NOT NULL;

COMMENT ON COLUMN edition.project_id IS
  'Optional off-chain presentation linkage; never a prerequisite for on-chain Edition creation.';

COMMENT ON TABLE edition_request IS
  'Historical legacy Safe-workflow records. New permissionless Editions do not create rows here.';
