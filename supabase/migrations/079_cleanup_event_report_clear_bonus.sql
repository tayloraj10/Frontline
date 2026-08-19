-- Per-report bonus for organizers who opt into clearing nearby trash reports when
-- logging a group cleanup event's team total (log_team_total, cleanup_events.py).
-- Folded into the base value before the volume-bonus multiplier is applied (so a big
-- report haul can itself help unlock a tier), then split across the credited pool.

INSERT INTO game_settings (key, value, category, label, description, sort_order) VALUES
  ('cleanup_event_report_clear_bonus_points', 3, 'points', 'Trash report clear bonus (points)', 'Points awarded per open trash report closed when an organizer opts to clear nearby reports while logging a group cleanup event''s team total.', 45)
ON CONFLICT (key) DO NOTHING;
