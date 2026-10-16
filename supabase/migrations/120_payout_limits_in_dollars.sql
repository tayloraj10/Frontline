-- Payout limits are edited by admins, so store them in dollars rather than cents.
-- Renames the three sponsored cap settings and converts their stored values.
UPDATE game_settings SET
  key = 'sponsored_default_cap_per_user_usd',
  value = value / 100,
  label = 'Sponsored: default per-person limit per site (USD)',
  description = 'Default most a single person can earn from one sponsored site. Plus members get this multiplied by the Plus earning cap multiplier. A limit set by the sponsor overrides it.'
WHERE key = 'sponsored_default_cap_per_user_cents';

UPDATE game_settings SET
  key = 'sponsored_default_cap_per_group_usd',
  value = value / 100,
  label = 'Sponsored: default per-group limit per area (USD)',
  description = 'Default most one group can earn from a single group-area pool. Plus groups get this multiplied by the Plus earning cap multiplier.'
WHERE key = 'sponsored_default_cap_per_group_cents';

UPDATE game_settings SET
  key = 'sponsored_daily_cap_per_user_usd',
  value = value / 100,
  label = 'Sponsored: daily limit per person (USD)',
  description = 'Most a single person can be credited across all sponsorships in one day. Plus members get this multiplied by the Plus earning cap multiplier.'
WHERE key = 'sponsored_daily_cap_per_user_cents';
