-- Pooled sponsored sites: one person starts a pool for a cleanup site with a goal, others add
-- onto it through Stripe Checkout. The platform holds the money. When paid contributions reach
-- the goal the pool activates by creating ONE funded site sponsorship (so claiming, payouts and
-- refunds reuse the existing sponsorship machinery). A pool that misses its deadline is closed
-- and every paid contribution is refunded.

CREATE TABLE sponsorship_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 80),
  message text CHECK (message IS NULL OR char_length(message) <= 500),
  goal_cents integer NOT NULL CHECK (goal_cents >= 1000),
  payout_rule jsonb NOT NULL,
  cap_per_user_cents integer CHECK (cap_per_user_cents IS NULL OR cap_per_user_cents > 0),
  site_label text NOT NULL,
  site_location geography(Point,4326) NOT NULL,
  site_radius_meters integer NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'active', 'expired', 'cancelled')),
  deadline timestamptz NOT NULL,
  sponsorship_id UUID REFERENCES sponsorships(id),
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sponsorship_pools_status_idx ON sponsorship_pools(status, deadline);
CREATE INDEX sponsorship_pools_creator_idx ON sponsorship_pools(creator_id);

CREATE TRIGGER sponsorship_pools_set_updated_at
  BEFORE UPDATE ON sponsorship_pools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sponsorship_pool_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES sponsorship_pools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 500),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'refunded')),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  refunded_at timestamptz
);

CREATE INDEX sponsorship_pool_contributions_pool_idx ON sponsorship_pool_contributions(pool_id, status);
CREATE INDEX sponsorship_pool_contributions_user_idx ON sponsorship_pool_contributions(user_id);

ALTER TABLE sponsorship_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsorship_pool_contributions ENABLE ROW LEVEL SECURITY;
-- No public policies: backend-only access via the service-role connection.
