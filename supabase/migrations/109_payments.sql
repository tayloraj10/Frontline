-- Subscriptions (payments use case 1, per dev-docs/payments-scoping-2026-08-20.md addendum).
-- Stripe Billing/Checkout only -- no Connect/payout rails here. Built in Stripe test mode;
-- everything stays admin-only (see backend/app/api/routes/payments.py) until a premium
-- feature exists and this is deliberately opened up to all users.

ALTER TABLE profiles ADD COLUMN stripe_customer_id text UNIQUE;
ALTER TABLE groups ADD COLUMN stripe_customer_id text UNIQUE;

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('user', 'group')),
  owner_id UUID NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_price_id text NOT NULL,
  status text NOT NULL,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_owner_idx ON subscriptions(owner_type, owner_id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
-- No public policies: backend-only access via the service-role connection, same as the
-- rest of the app's DB access pattern. Nothing here is meant to be queried from the client.
