-- Public Builder questions and owner-authored answers.
CREATE TABLE IF NOT EXISTS builder_question (
  id text PRIMARY KEY,
  builder_account_id text NOT NULL REFERENCES account(id),
  asker_account_id text NOT NULL REFERENCES account(id),
  question text NOT NULL,
  answer text NOT NULL DEFAULT '',
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_question_builder ON builder_question(builder_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_question_asker ON builder_question(asker_account_id, created_at DESC);
