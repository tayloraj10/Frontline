-- Expand campaign_type to include hex_bloom
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_campaign_type_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_campaign_type_check
  CHECK (campaign_type IN ('territory', 'collage', 'choropleth', 'heatmap', 'hex_bloom'));

-- Expand contribution_type to include solarpunk types
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_contribution_type_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_contribution_type_check
  CHECK (contribution_type IN (
    'cleanup', 'photo', 'registration', 'advocacy',
    'civic_action', 'unfollow', 'solarpunk_action', 'solarpunk_photo'
  ));

-- Expand geo_unit to include h3_hex
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_geo_unit_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_geo_unit_check
  CHECK (geo_unit IN ('census_tract', 'zip', 'state', 'point', 'h3_hex'));

-- Make geometry nullable so h3_hex units can be auto-created during contribution submission
ALTER TABLE geo_units ALTER COLUMN geometry DROP NOT NULL;

-- Provenance column for pre-seeded world hexes
ALTER TABLE geo_units ADD COLUMN IF NOT EXISTS seed_source TEXT;
