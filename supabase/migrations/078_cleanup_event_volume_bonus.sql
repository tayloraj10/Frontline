-- Adds the group cleanup event volume bonus: log-team-total submissions get a multiplier
-- bump for every N points worth of raw value in the total, rewarding high-turnout events
-- where a big haul would otherwise split into small per-attendee shares. Applied in
-- log_team_total (cleanup_events.py) against the pre-multiplier total, then capped.

INSERT INTO game_settings (key, value, category, label, description, sort_order) VALUES
  ('cleanup_event_volume_bonus_tier_points', 50, 'multipliers', 'Volume bonus tier size (points)', 'Every this many points'' worth of raw value in a logged team total adds one volume-bonus tier.', 32),
  ('cleanup_event_volume_bonus_per_tier', 0.25, 'multipliers', 'Volume bonus per tier', 'Multiplier increase per volume-bonus tier crossed, e.g. 0.25 = +25% per tier.', 33),
  ('cleanup_event_volume_bonus_max_multiplier', 2.0, 'multipliers', 'Volume bonus max multiplier', 'Cap on the total volume-bonus multiplier a single team-total log can reach.', 34)
ON CONFLICT (key) DO NOTHING;
