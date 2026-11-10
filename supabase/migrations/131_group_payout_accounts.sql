-- Group payout accounts: the Stripe Connect Express account a group's sponsorship money is paid to.
-- Any admin of the group can start or reopen setup. A group needs a ready account to take group money.
CREATE TABLE IF NOT EXISTS group_payout_accounts (
  group_id UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
  stripe_connect_account_id TEXT UNIQUE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  set_up_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE group_payout_accounts ENABLE ROW LEVEL SECURITY;
