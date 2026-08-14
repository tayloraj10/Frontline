-- Moves the business "radius of influence" tier distances out of a hardcoded
-- RADIUS_TIER_METERS dict in partners.py and into game_settings, so a site admin can
-- retune them without a deploy (same pattern as the existing proximity_meters settings).

-- Meter values are back-converted from clean feet numbers (300ft / 1,300ft / 5,000ft) rather
-- than round meters, since the business-facing radius view displays feet only.
INSERT INTO game_settings (key, value, category, label, description, sort_order) VALUES
  ('radius_tier_block_meters', 91.44, 'proximity', 'Radius tier - Block (meters)', 'Distance used for the "Block" tier on a business''s radius-of-influence view (300 ft).', 55),
  ('radius_tier_neighborhood_meters', 396.24, 'proximity', 'Radius tier - Neighborhood (meters)', 'Distance used for the "Neighborhood" tier on a business''s radius-of-influence view (1,300 ft).', 56),
  ('radius_tier_wide_meters', 1524.0, 'proximity', 'Radius tier - Wide (meters)', 'Distance used for the "District" tier on a business''s radius-of-influence view (5,000 ft).', 57);
