-- Sponsored site claims get the same safety nets as marketplace jobs: a location override that flags the
-- claim for review, a route flag when too few route points were recorded, and the "all the bags are in my
-- finished photo" acknowledgement. Admins see these as flags in the allocation review.
ALTER TABLE sponsorship_site_claims
  ADD COLUMN IF NOT EXISTS location_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_flag_reason text,
  ADD COLUMN IF NOT EXISTS track_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS track_flag_reason text,
  ADD COLUMN IF NOT EXISTS bags_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS bags_count integer CHECK (bags_count IS NULL OR bags_count BETWEEN 0 AND 500);
