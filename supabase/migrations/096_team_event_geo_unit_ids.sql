-- Switch team_event_teams from a single geofence (geo_unit_id) to multiple (geo_unit_ids).
-- Not yet exposed in any UI/prod data, safe to replace outright.

ALTER TABLE team_event_teams ADD COLUMN geo_unit_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE team_event_teams DROP COLUMN geo_unit_id;
