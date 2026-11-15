-- Earning limits move from per-site and daily dollar caps to one weekly ceiling.
-- The ceiling counts everything a person earns through the app (jobs and sponsored sites) over
-- a rolling 7 days. The payout that crosses it is still paid, but the person cannot take new jobs
-- or claim sponsored sites until they are back under it. Plus members get the higher ceiling.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('earning_weekly_ceiling_usd', 200, 'payments', 'Weekly earning ceiling per person (USD)',
   'Most a person can earn through jobs and sponsored sites in a rolling 7 days before they are paused from taking new work. The payout that crosses it is still paid.'),
  ('earning_weekly_ceiling_plus_usd', 500, 'payments', 'Frontline Plus: weekly earning ceiling (USD)',
   'The weekly earning ceiling for Frontline Plus members.'),
  ('fraud_new_account_days', 7, 'payments', 'Flag earners with accounts newer than (days)',
   'Sponsored-site payouts to accounts younger than this are flagged for extra care in admin review.')
ON CONFLICT (key) DO NOTHING;

-- Retired: there is no per-person dollar cap on one site or per day any more.
DELETE FROM game_settings WHERE key IN ('sponsored_default_cap_per_user_usd', 'sponsored_daily_cap_per_user_usd');
UPDATE game_settings SET
  description = 'Multiplier applied to the default per-group cap for Frontline Plus groups. 1 disables the perk. The Plus weekly earning ceiling is its own setting.'
WHERE key = 'plus_earning_cap_multiplier';
