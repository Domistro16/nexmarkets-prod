-- NexMarkets social layer: builder profiles, follows, watchlists, milestones.

CREATE TABLE IF NOT EXISTS builder_profile (
  id text PRIMARY KEY,
  account_id text NOT NULL UNIQUE REFERENCES account(id),
  display_name text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  about text NOT NULL DEFAULT '',
  avatar_url text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  links jsonb NOT NULL DEFAULT '{}'::jsonb,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS builder_follow (
  id text PRIMARY KEY,
  follower_account_id text NOT NULL REFERENCES account(id),
  builder_account_id text NOT NULL REFERENCES account(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(follower_account_id, builder_account_id),
  CHECK(follower_account_id <> builder_account_id)
);

CREATE TABLE IF NOT EXISTS project_watchlist (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES account(id),
  project_id text NOT NULL REFERENCES project(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, project_id)
);

CREATE TABLE IF NOT EXISTS builder_milestone (
  id text PRIMARY KEY,
  builder_account_id text NOT NULL REFERENCES account(id),
  project_id text REFERENCES project(id),
  title text NOT NULL,
  content text NOT NULL,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_follow_builder ON builder_follow(builder_account_id);
CREATE INDEX IF NOT EXISTS idx_builder_follow_follower ON builder_follow(follower_account_id);
CREATE INDEX IF NOT EXISTS idx_project_watchlist_project ON project_watchlist(project_id);
CREATE INDEX IF NOT EXISTS idx_builder_milestone_builder ON builder_milestone(builder_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_milestone_project ON builder_milestone(project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_builder_profile_featured ON builder_profile(featured) WHERE featured = true;
