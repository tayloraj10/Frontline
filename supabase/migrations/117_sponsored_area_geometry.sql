-- Sponsored group areas get their own stored shape (payments v2).
-- Until now a group area could only point at ONE existing geo unit. A sponsor can now
-- define the area as several geo units merged together, a circle (point + radius) or a
-- hand-drawn polygon. All three are normalized server-side into one MultiPolygon stored
-- here, so the map layer and the "is this event inside the area" check read a single
-- column no matter how the area was defined.

ALTER TABLE sponsorships ADD COLUMN area_geometry geometry(MultiPolygon, 4326);
ALTER TABLE sponsorships ADD COLUMN area_name text;
ALTER TABLE sponsorships ADD COLUMN area_source text
  CHECK (area_source IS NULL OR area_source IN ('geo_units', 'circle', 'polygon'));

-- Existing group areas (single geo unit) keep working: copy the unit's shape and name.
UPDATE sponsorships s
SET area_geometry = gu.geometry,
    area_name = COALESCE(gu.display_name, gu.unit_id),
    area_source = 'geo_units'
FROM geo_units gu
WHERE s.model = 'group_area' AND gu.id = s.target_geo_unit_id AND s.area_geometry IS NULL;

-- New group areas use target_type 'area' (no geo unit link); legacy 'geo_unit' rows stay valid.
ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_type_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_type_check
  CHECK (target_type IN ('cleanup_event', 'geo_unit', 'general', 'site', 'area'));

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_one_of;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_one_of CHECK (
  (target_type = 'cleanup_event' AND target_cleanup_id IS NOT NULL AND target_geo_unit_id IS NULL)
  OR (target_type = 'geo_unit' AND target_geo_unit_id IS NOT NULL AND target_cleanup_id IS NULL)
  OR (target_type IN ('general', 'site', 'area') AND target_cleanup_id IS NULL AND target_geo_unit_id IS NULL)
);
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_area_has_shape CHECK (
  target_type <> 'area' OR (area_geometry IS NOT NULL AND area_source IS NOT NULL)
);

CREATE INDEX sponsorships_area_geometry_idx ON sponsorships USING gist (area_geometry)
  WHERE area_geometry IS NOT NULL;
