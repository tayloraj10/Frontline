-- Add UK postcode districts as a new geo_units unit_type, and allow campaigns
-- to span multiple geo_unit types at once (e.g. Trash War: US zips + UK postcode districts).

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_geo_unit_check;

ALTER TABLE campaigns
  ALTER COLUMN geo_unit TYPE TEXT[]
  USING (CASE WHEN geo_unit IS NULL THEN NULL ELSE ARRAY[geo_unit] END);

ALTER TABLE campaigns ADD CONSTRAINT campaigns_geo_unit_check
  CHECK (geo_unit <@ ARRAY['census_tract', 'zip', 'state', 'point', 'h3_hex', 'uk_postcode_district']::text[]);
