-- Strikes for cleaners who take a job and do not do it. Enough of them in the window suspends the cleaner profile.
CREATE TABLE IF NOT EXISTS marketplace_strikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES marketplace_jobs(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('no_show', 'late_back_out')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_strikes_user_idx ON marketplace_strikes (user_id, created_at DESC);
ALTER TABLE marketplace_strikes ENABLE ROW LEVEL SECURITY;

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('marketplace_strike_limit', 3, 'payments', 'Marketplace: strikes before suspension',
   'Cleaners who take a job and do not show up or back out late get a strike. This many within the window suspends their cleaner profile.'),
  ('marketplace_strike_window_days', 90, 'payments', 'Marketplace: strike window (days)',
   'How far back strikes count toward suspension.')
ON CONFLICT (key) DO NOTHING;
