-- Chat messages the filter flagged for an admin to look at (abusive language, threats).
ALTER TABLE marketplace_messages
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS marketplace_messages_flagged_idx ON marketplace_messages (created_at DESC)
  WHERE flag_reason IS NOT NULL AND reviewed_at IS NULL;
