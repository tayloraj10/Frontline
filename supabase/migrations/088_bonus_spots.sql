-- Random Bonus Spots (Option A, see dev-docs/random-bonus-spots-scoping-2026-08-26.md):
-- admin-placed point-on-the-map score multiplier, drawn from a real problem_reports
-- location so it's never placed somewhere inaccessible or trash-free. Reuses
-- campaign_events (event_type = 'bonus_spot') rather than a new table -- it already
-- generalizes score-multiplier effects via effect_config JSONB, this just adds the
-- point-geometry columns a geo_unit-keyed event doesn't need. No CHECK constraint
-- exists on campaign_events.event_type today, so no constraint change is needed to
-- allow the new value.

ALTER TABLE campaign_events
  ADD COLUMN location GEOGRAPHY(POINT, 4326),
  ADD COLUMN radius_m INTEGER,
  ADD COLUMN source_problem_report_id UUID REFERENCES problem_reports(id);

CREATE INDEX campaign_events_location_idx ON campaign_events USING GIST (location);

INSERT INTO game_settings (key, value, category, label, description, sort_order) VALUES
  ('bonus_spot_multiplier', 2, 'bonus_spots', 'Bonus spot multiplier', 'Score multiplier applied to a cleanup logged inside an active bonus spot''s radius.', 60),
  ('bonus_spot_default_radius_m', 91.44, 'bonus_spots', 'Bonus spot default radius (meters)', 'Default claim radius used when an admin spawns a bonus spot without specifying one (300 ft).', 61),
  ('bonus_spot_default_duration_minutes', 4320, 'bonus_spots', 'Bonus spot default duration (minutes)', 'Default active lifetime used when an admin spawns a bonus spot without specifying a duration.', 62);
