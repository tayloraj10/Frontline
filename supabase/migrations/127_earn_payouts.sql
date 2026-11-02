-- Earn payouts: real Stripe Connect transfers on approval, mirroring Hire.
-- payout_accounts holds a Connect Express account for any user (cleaners keep theirs on
-- cleaner_profiles and Earn reuses it when present).

CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id UUID PRIMARY KEY REFERENCES profiles(id),
  stripe_connect_account_id TEXT UNIQUE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE payout_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE sponsorship_allocations
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS payout_error TEXT;
