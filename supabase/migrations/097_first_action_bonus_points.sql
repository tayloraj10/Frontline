-- New-user first-action bonus points (dev-docs/master-backlog.md, "New-user
-- first-action bonus points"): give first-time users an extra bump on their first
-- two milestone actions.
--
-- (1) First cleanup event check-in: the check-in endpoints (cleanup_events.py) double
-- cleanup_event_checkin_value for a user's first-ever check-in only, computed in Python
-- from a COUNT against existing 'cleanup_event_checkin' rows -- no new setting needed,
-- it's a straight 2x of the existing value.
--
-- (2) First individual cleanup log: a new fixed bonus, awarded as its own side-credit
-- contribution (same pattern as 'solarpunk_hex_credit' in 051) alongside the real
-- 'cleanup' contribution, so it shows separately in activity history without disturbing
-- the existing bag/pound points math.
INSERT INTO game_settings (key, value, category, label, description, sort_order) VALUES
  ('first_cleanup_bonus_value', 10, 'points', 'First cleanup bonus', 'One-time bonus awarded the first time a user logs an individual cleanup.', 46)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION contribution_points(p_contribution_type TEXT, p_value NUMERIC)
RETURNS NUMERIC AS $$
  SELECT CASE p_contribution_type
    WHEN 'cleanup' THEN COALESCE(p_value, 0)
    WHEN 'photo' THEN COALESCE(p_value, 0)
    WHEN 'solarpunk_photo' THEN 1
    WHEN 'solarpunk_action' THEN 2
    WHEN 'solarpunk_hex_credit' THEN 0
    WHEN 'cleanup_event_checkin' THEN COALESCE(p_value, 0)
    WHEN 'first_cleanup_bonus' THEN COALESCE(p_value, 0)
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;
