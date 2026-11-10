-- Cleaners take open jobs at the posted price (no offers or counter pricing).
-- If a price looks too low they flag it instead, so the poster can adjust.
CREATE TABLE marketplace_price_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  cleaner_id UUID NOT NULL REFERENCES profiles(id),
  suggested_price_cents integer CHECK (suggested_price_cents IS NULL OR suggested_price_cents > 0),
  note text CHECK (note IS NULL OR length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, cleaner_id)
);
CREATE INDEX marketplace_price_flags_job_idx ON marketplace_price_flags(job_id);
ALTER TABLE marketplace_price_flags ENABLE ROW LEVEL SECURITY;
-- No public policies: backend-only access via the service role, same as the rest of the marketplace.
