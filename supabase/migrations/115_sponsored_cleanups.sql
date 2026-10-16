-- Sponsored cleanups (payments v2, dev-docs/payments-v2-scoping-2026-10-15.md).
-- A sponsor's money sits in a pool tied to a place and a payout rule. Workers claim a
-- site (proximity + before photo + timed window, modeled on problem report claims),
-- finish it with an after photo, and an admin approves an allocation owed to them.
-- Nothing here moves real money: 'paid_out' is a manual admin flag until a payout rail
-- is chosen. No expiry on funded pools. Admin-only until launch like the rest of payments.

-- 1. Sponsorships gain a model, payout rule, caps, remaining balance and (for sites) a place.
ALTER TABLE sponsorships ADD COLUMN model text NOT NULL DEFAULT 'general'
  CHECK (model IN ('general', 'site', 'group_area'));
ALTER TABLE sponsorships ADD COLUMN payout_rule jsonb;
ALTER TABLE sponsorships ADD COLUMN cap_per_user_cents integer
  CHECK (cap_per_user_cents IS NULL OR cap_per_user_cents > 0);
ALTER TABLE sponsorships ADD COLUMN remaining_cents integer;
ALTER TABLE sponsorships ADD COLUMN expires_at timestamptz;
ALTER TABLE sponsorships ADD COLUMN site_label text;
ALTER TABLE sponsorships ADD COLUMN site_location geography(Point, 4326);
ALTER TABLE sponsorships ADD COLUMN site_radius_meters integer;

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_status_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_status_check
  CHECK (status IN ('pending_funding', 'funded', 'released', 'refunded', 'exhausted'));

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_type_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_type_check
  CHECK (target_type IN ('cleanup_event', 'geo_unit', 'general', 'site'));

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_one_of;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_one_of CHECK (
  (target_type = 'cleanup_event' AND target_cleanup_id IS NOT NULL AND target_geo_unit_id IS NULL)
  OR (target_type = 'geo_unit' AND target_geo_unit_id IS NOT NULL AND target_cleanup_id IS NULL)
  OR (target_type IN ('general', 'site') AND target_cleanup_id IS NULL AND target_geo_unit_id IS NULL)
);
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_site_has_place CHECK (
  target_type <> 'site' OR (site_location IS NOT NULL AND site_radius_meters IS NOT NULL)
);

CREATE INDEX sponsorships_site_location_idx ON sponsorships USING gist (site_location) WHERE site_location IS NOT NULL;
CREATE INDEX sponsorships_model_idx ON sponsorships(model) WHERE model <> 'general';

-- 2. Site claims: one row per claim attempt on a sponsored site.
-- status: 'claimed' (awaiting before photo), 'in_progress' (before photo in, window open),
-- 'submitted' (after photo in, awaiting review), 'expired', 'released'.
CREATE TABLE sponsorship_site_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id UUID NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'in_progress', 'submitted', 'expired', 'released')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  before_deadline_at timestamptz NOT NULL,
  before_photo_url text,
  before_location geography(Point, 4326),
  before_submitted_at timestamptz,
  after_deadline_at timestamptz,
  after_photo_url text,
  after_location geography(Point, 4326),
  after_submitted_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A site has at most one live claim, a user has at most one live claim anywhere.
CREATE UNIQUE INDEX sponsorship_site_claims_one_live_per_site
  ON sponsorship_site_claims(sponsorship_id) WHERE status IN ('claimed', 'in_progress');
CREATE UNIQUE INDEX sponsorship_site_claims_one_live_per_user
  ON sponsorship_site_claims(user_id) WHERE status IN ('claimed', 'in_progress');
CREATE INDEX sponsorship_site_claims_status_idx ON sponsorship_site_claims(status);

CREATE TRIGGER sponsorship_site_claims_set_updated_at
  BEFORE UPDATE ON sponsorship_site_claims
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 3. Allocations: what a verified piece of work is owed from a pool. Append-only ledger;
-- only status and review fields change. Payee is a user (site) or a group (group_area).
CREATE TABLE sponsorship_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsorship_id UUID NOT NULL REFERENCES sponsorships(id),
  user_id UUID REFERENCES profiles(id),
  group_id UUID REFERENCES groups(id),
  claim_id UUID REFERENCES sponsorship_site_claims(id),
  cleanup_id UUID REFERENCES cleanups(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'paid_out')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at timestamptz,
  reject_reason text,
  paid_out_at timestamptz,
  paid_out_by UUID REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sponsorship_allocations_payee_one_of CHECK (
    (user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)
  ),
  CONSTRAINT sponsorship_allocations_source_one_of CHECK (claim_id IS NOT NULL OR cleanup_id IS NOT NULL)
);

CREATE INDEX sponsorship_allocations_sponsorship_idx ON sponsorship_allocations(sponsorship_id);
CREATE INDEX sponsorship_allocations_user_idx ON sponsorship_allocations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX sponsorship_allocations_group_idx ON sponsorship_allocations(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX sponsorship_allocations_status_idx ON sponsorship_allocations(status);

CREATE TRIGGER sponsorship_allocations_set_updated_at
  BEFORE UPDATE ON sponsorship_allocations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE sponsorship_site_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsorship_allocations ENABLE ROW LEVEL SECURITY;
-- No public policies: backend-only, same pattern as sponsorships.

-- 4. Tunable settings (defaults are starting points, refine later).
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('sponsored_claim_before_window_minutes', 30, 'payments', 'Sponsored site: before-photo window (minutes)', 'How long a claimant has to submit the starting photo after claiming a sponsored site.'),
  ('sponsored_claim_work_window_minutes', 120, 'payments', 'Sponsored site: work window (minutes)', 'How long a claimant owns a sponsored site after the starting photo before it reopens to others.'),
  ('sponsored_claim_proximity_meters', 100, 'payments', 'Sponsored site: claim distance (meters)', 'How close a claimant must be to the sponsored site to claim it and submit photos.'),
  ('sponsored_default_cap_per_user_cents', 2500, 'payments', 'Sponsored: default per-user cap (cents)', 'Default maximum a single user can earn from one sponsorship pool.'),
  ('sponsored_daily_cap_per_user_cents', 5000, 'payments', 'Sponsored: daily per-user cap (cents)', 'Maximum a single user can be credited across all sponsorship pools per day.');
