-- Align groups / problem_reports / contributions with the DOGS shared data-model API
-- (DirectoryEntry, Cleanup, TrashReport). Frontline does not call the live DOGS API —
-- this migration reshapes Frontline's own tables to match those schemas so the row
-- shapes are forward-compatible with future data sharing. See frontend/src/types/dogs.ts
-- for the canonical reference types.

-- ── groups -> DirectoryEntry shape ─────────────────────────────────────────────
ALTER TABLE groups ADD COLUMN image_url TEXT;
UPDATE groups SET image_url = logo_url;
ALTER TABLE groups DROP COLUMN logo_url;

ALTER TABLE groups ADD COLUMN social_links JSONB DEFAULT '{}'::jsonb;
UPDATE groups SET social_links = jsonb_build_object('website', website) WHERE website IS NOT NULL;
ALTER TABLE groups DROP COLUMN website;

ALTER TABLE groups ADD COLUMN categories TEXT[] DEFAULT '{}';
ALTER TABLE groups ADD COLUMN featured BOOLEAN DEFAULT FALSE;
ALTER TABLE groups ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── problem_reports -> TrashReport shape ───────────────────────────────────────
ALTER TABLE problem_reports RENAME COLUMN reported_by TO submitted_by_user_id;

ALTER TABLE problem_reports ADD COLUMN image_urls TEXT[] DEFAULT '{}';
UPDATE problem_reports SET image_urls = ARRAY[photo_url] WHERE photo_url IS NOT NULL;
ALTER TABLE problem_reports DROP COLUMN photo_url;

ALTER TABLE problem_reports DROP CONSTRAINT problem_reports_status_check;
ALTER TABLE problem_reports ADD CONSTRAINT problem_reports_status_check
  CHECK (status IN ('open', 'scheduled', 'in_progress', 'completed', 'addressed', 'verified', 'cancelled'));

ALTER TABLE problem_reports ADD COLUMN resolved_by_user_id UUID REFERENCES profiles(id);
ALTER TABLE problem_reports ADD COLUMN resolved_at TIMESTAMPTZ;

-- Update the RLS insert policy to use the renamed column (policies aren't renamed
-- automatically when a referenced column is renamed in some Postgres versions, but the
-- expression text must be rewritten regardless since `reported_by` no longer exists).
DROP POLICY "problem_reports_insert" ON problem_reports;
CREATE POLICY "problem_reports_insert" ON problem_reports
  FOR INSERT WITH CHECK (auth.uid() = submitted_by_user_id);

-- ── New cleanups table -> Cleanup shape ─────────────────────────────────────────
CREATE TABLE cleanups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),       -- Frontline extension, no DOGS equivalent
  geo_unit_id UUID REFERENCES geo_units(id),        -- Frontline extension, no DOGS equivalent
  title TEXT NOT NULL DEFAULT 'Cleanup',
  description TEXT,
  location GEOGRAPHY(POINT, 4326),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  status TEXT DEFAULT 'completed'
    CHECK (status IN ('open', 'scheduled', 'in_progress', 'completed', 'addressed', 'verified', 'cancelled')),
  image_urls TEXT[] DEFAULT '{}',
  metrics_small_bags INT,
  metrics_large_bags INT,
  metrics_pounds NUMERIC,
  submitted_by_user_id UUID REFERENCES profiles(id),
  organizer_user_ids UUID[] DEFAULT '{}',
  rsvp_user_ids UUID[] DEFAULT '{}',
  attended_user_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX cleanups_location_idx ON cleanups USING GIST (location);

ALTER TABLE problem_reports ADD COLUMN resolved_by_cleanup_id UUID REFERENCES cleanups(id) ON DELETE SET NULL;

ALTER TABLE cleanups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cleanups_select" ON cleanups FOR SELECT USING (true);
CREATE POLICY "cleanups_insert" ON cleanups FOR INSERT WITH CHECK (auth.uid() = submitted_by_user_id);

-- ── contributions: link a cleanup-type contribution to its detail row ──────────
ALTER TABLE contributions ADD COLUMN cleanup_id UUID REFERENCES cleanups(id) ON DELETE SET NULL;
