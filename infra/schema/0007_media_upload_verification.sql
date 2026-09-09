ALTER TABLE media_asset ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'PREPARED';
ALTER TABLE media_asset ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;
ALTER TABLE media_asset ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE media_asset ADD COLUMN IF NOT EXISTS public_url text;
ALTER TABLE media_asset ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE media_asset ADD COLUMN IF NOT EXISTS height integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_upload_status_check'
  ) THEN
    ALTER TABLE media_asset
      ADD CONSTRAINT media_asset_upload_status_check
      CHECK (upload_status IN ('PREPARED','UPLOADED','FAILED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_asset_dimensions_check'
  ) THEN
    ALTER TABLE media_asset
      ADD CONSTRAINT media_asset_dimensions_check
      CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_owner_created ON media_asset(owner_account_id,created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_public ON media_asset(id) WHERE safety_status='APPROVED' AND deleted_at IS NULL;
