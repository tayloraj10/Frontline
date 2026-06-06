-- geo_units becomes a shared geographic reference table (not per-campaign).
-- Safe in dev: truncates geo_units (cascades to contributions + territory_claims).
-- Re-run POST /admin/load-geo-units/zips and /states to repopulate.

TRUNCATE geo_units CASCADE;

ALTER TABLE geo_units
  DROP CONSTRAINT IF EXISTS geo_units_campaign_id_fkey,
  DROP CONSTRAINT IF EXISTS geo_units_campaign_id_unit_id_key,
  DROP COLUMN IF EXISTS campaign_id;

ALTER TABLE geo_units
  ADD CONSTRAINT geo_units_unit_type_unit_id_key UNIQUE (unit_type, unit_id);
