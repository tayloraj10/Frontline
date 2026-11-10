-- Sponsorships (payments use case 3, funding-only per dev-docs/payments-scoping-2026-08-20.md
-- addendum). A sponsor (individual user or partner business) funds either a specific
-- cleanup event or a geo area (e.g. a neighborhood).
--
-- No Stripe Connect / payout rails here -- money collected via a one-time Checkout
-- session sits with the platform. "released" is a manual admin-tracked status flag,
-- not a real transfer out, until Connect + legal/tax review (sweepstakes/contest law,
-- 1099s, money-transmitter exposure) happens. Stays admin-only until launch, same
-- dual-gate pattern (is_admin + shared secret) as subscriptions.

CREATE TABLE sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  sponsor_type text NOT NULL CHECK (sponsor_type IN ('user', 'business')),
  sponsor_user_id UUID REFERENCES profiles(id),
  sponsor_business_id UUID REFERENCES partner_businesses(id),

  target_type text NOT NULL CHECK (target_type IN ('cleanup_event', 'geo_unit')),
  target_cleanup_id UUID REFERENCES cleanups(id),
  target_geo_unit_id UUID REFERENCES geo_units(id),

  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'usd',
  message text,

  status text NOT NULL DEFAULT 'pending_funding'
    CHECK (status IN ('pending_funding', 'funded', 'released', 'refunded')),

  stripe_customer_id text,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,

  released_at timestamptz,
  released_by UUID REFERENCES profiles(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sponsorships_sponsor_one_of CHECK (
    (sponsor_type = 'user' AND sponsor_user_id IS NOT NULL AND sponsor_business_id IS NULL)
    OR (sponsor_type = 'business' AND sponsor_business_id IS NOT NULL AND sponsor_user_id IS NULL)
  ),
  CONSTRAINT sponsorships_target_one_of CHECK (
    (target_type = 'cleanup_event' AND target_cleanup_id IS NOT NULL AND target_geo_unit_id IS NULL)
    OR (target_type = 'geo_unit' AND target_geo_unit_id IS NOT NULL AND target_cleanup_id IS NULL)
  )
);

CREATE INDEX sponsorships_sponsor_user_idx ON sponsorships(sponsor_user_id) WHERE sponsor_user_id IS NOT NULL;
CREATE INDEX sponsorships_sponsor_business_idx ON sponsorships(sponsor_business_id) WHERE sponsor_business_id IS NOT NULL;
CREATE INDEX sponsorships_target_cleanup_idx ON sponsorships(target_cleanup_id) WHERE target_cleanup_id IS NOT NULL;
CREATE INDEX sponsorships_target_geo_unit_idx ON sponsorships(target_geo_unit_id) WHERE target_geo_unit_id IS NOT NULL;
CREATE INDEX sponsorships_status_idx ON sponsorships(status);

CREATE TRIGGER sponsorships_set_updated_at
  BEFORE UPDATE ON sponsorships
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE sponsorships ENABLE ROW LEVEL SECURITY;
-- No public policies: backend-only access via the service-role connection, same pattern
-- as subscriptions -- nothing here is meant to be queried from the client directly.
