-- Per-admin opt out for the daily admin digest email (POST /api/admin-prod/daily-digest/run).
-- Not a privileged column, so the profiles_update policy lets each admin flip their own flag.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS admin_daily_email_opt_out boolean NOT NULL DEFAULT false;
