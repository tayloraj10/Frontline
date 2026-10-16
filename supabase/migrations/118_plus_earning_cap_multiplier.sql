-- Frontline Plus members earn more from sponsored cleanups: this multiplies the default
-- per-user pool cap and the daily cap (never a cap a sponsor set explicitly on their pool).
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('plus_earning_cap_multiplier', 2, 'payments', 'Frontline Plus: earning cap multiplier', 'Multiplier applied to the default per-user pool cap and the daily cap for Frontline Plus members. 1 disables the perk.')
ON CONFLICT (key) DO NOTHING;
