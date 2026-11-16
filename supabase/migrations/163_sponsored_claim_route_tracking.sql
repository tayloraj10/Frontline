-- Route tracking for sponsored site claims, same idea as marketplace jobs (migration 141). Points are
-- recorded by the native app between the starting photo and the after photo, and are visible to admins
-- reviewing the finished site. Photo locations already live on sponsorship_claim_photos.
CREATE TABLE IF NOT EXISTS sponsorship_claim_track_points (
  id bigserial PRIMARY KEY,
  claim_id uuid NOT NULL REFERENCES sponsorship_site_claims(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m real,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, recorded_at)
);
CREATE INDEX IF NOT EXISTS sponsorship_claim_track_points_claim_idx ON sponsorship_claim_track_points (claim_id, recorded_at);
ALTER TABLE sponsorship_claim_track_points ENABLE ROW LEVEL SECURITY;
