-- Pools become a funding source for any sponsored site or group area. A pool still activates into
-- ONE funded sponsorship, but that sponsorship can now be a group area (a region, not a point) and
-- carry any payout rule the sponsor flow allows (per cleanup, per bag, per attendee).

ALTER TABLE sponsorship_pools
  ADD COLUMN model text NOT NULL DEFAULT 'site' CHECK (model IN ('site', 'group_area')),
  ADD COLUMN area_geometry geometry(MultiPolygon, 4326),
  ADD COLUMN area_source text,
  ADD COLUMN area_name text,
  ALTER COLUMN site_label DROP NOT NULL,
  ALTER COLUMN site_location DROP NOT NULL,
  ALTER COLUMN site_radius_meters DROP NOT NULL;

ALTER TABLE sponsorship_pools
  ADD CONSTRAINT sponsorship_pools_place_check CHECK (
    (model = 'site' AND site_label IS NOT NULL AND site_location IS NOT NULL AND site_radius_meters IS NOT NULL)
    OR (model = 'group_area' AND area_geometry IS NOT NULL AND area_source IS NOT NULL)
  );
