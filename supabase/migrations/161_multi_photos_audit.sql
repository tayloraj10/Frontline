-- Multiple before/after photos with an audit trail. Photos added after the work was submitted are
-- flagged `late`; photos a doer removes are soft-deleted so reviewers can still see them.
ALTER TABLE marketplace_job_photos
  ADD COLUMN IF NOT EXISTS late boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- Sponsored site claims keep their first before/after URLs for compatibility; every photo lives here.
CREATE TABLE IF NOT EXISTS sponsorship_claim_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES sponsorship_site_claims(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('before', 'after')),
  url text NOT NULL,
  latitude double precision,
  longitude double precision,
  late boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid
);
CREATE INDEX IF NOT EXISTS sponsorship_claim_photos_claim_idx ON sponsorship_claim_photos (claim_id, created_at);
ALTER TABLE sponsorship_claim_photos ENABLE ROW LEVEL SECURITY;

INSERT INTO sponsorship_claim_photos (claim_id, uploader_id, kind, url, latitude, longitude, created_at)
SELECT id, user_id, 'before', before_photo_url,
       ST_Y(before_location::geometry), ST_X(before_location::geometry), COALESCE(before_submitted_at, now())
FROM sponsorship_site_claims c
WHERE before_photo_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sponsorship_claim_photos p WHERE p.claim_id = c.id AND p.kind = 'before');
INSERT INTO sponsorship_claim_photos (claim_id, uploader_id, kind, url, latitude, longitude, created_at)
SELECT id, user_id, 'after', after_photo_url,
       ST_Y(after_location::geometry), ST_X(after_location::geometry), COALESCE(after_submitted_at, now())
FROM sponsorship_site_claims c
WHERE after_photo_url IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sponsorship_claim_photos p WHERE p.claim_id = c.id AND p.kind = 'after');
