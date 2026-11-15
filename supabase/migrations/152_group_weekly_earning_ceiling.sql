-- Groups follow the same rules as individuals: once a day per sponsored area, and one weekly
-- ceiling on what the group earns from sponsored areas. Groups get a higher ceiling than a person,
-- and Frontline Plus groups a higher one again. Replaces the old per-group, per-pool dollar cap.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('earning_weekly_ceiling_group_usd', 500, 'payments', 'Weekly earning ceiling per group (USD)',
   'Most a group can earn from sponsored areas in a rolling 7 days before it cannot host new sponsored events. The payout that crosses it is still paid.'),
  ('earning_weekly_ceiling_group_plus_usd', 1000, 'payments', 'Frontline Plus: weekly earning ceiling per group (USD)',
   'The weekly earning ceiling for Frontline Plus groups.')
ON CONFLICT (key) DO NOTHING;

DELETE FROM game_settings WHERE key = 'sponsored_default_cap_per_group_usd';
