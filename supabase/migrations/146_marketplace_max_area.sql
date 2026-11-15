-- Size limits for drawn areas, pins and geo-unit picks, all tunable from the admin settings.
-- Stored in the units people see (feet, square feet, square miles). Values match what shipped before.
DELETE FROM game_settings WHERE key = 'marketplace_max_area_sqm';

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('marketplace_job_min_area_sqft', 500, 'payments', 'Marketplace: min drawn job area (sq ft)',
   'Smallest area a customer can draw when posting a job. 500 sq ft is about 22 by 22 ft, enough to outline a yard or the front of a house.'),
  ('marketplace_job_max_area_sqmi', 0.1, 'payments', 'Marketplace: max drawn job area (sq mi)',
   'Largest area a customer can draw when posting a job.'),
  ('marketplace_pin_radius_min_ft', 25, 'payments', 'Pin radius: min (ft)',
   'Smallest radius for a job pin or a sponsored site claim radius.'),
  ('marketplace_pin_radius_max_ft', 1000, 'payments', 'Pin radius: max (ft)',
   'Largest radius for a job pin or a sponsored site claim radius.'),
  ('marketplace_max_vertices', 60, 'payments', 'Drawn shape: max points',
   'Most corner points allowed on a drawn job or sponsored area.'),
  ('sponsored_area_min_sqft', 21528, 'payments', 'Sponsored area: min drawn size (sq ft)',
   'Smallest area a sponsor can draw or circle. Neighborhood and zip picks are not limited.'),
  ('sponsored_area_max_sqmi', 2, 'payments', 'Sponsored area: max drawn size (sq mi)',
   'Largest area a sponsor can draw or circle. Neighborhood and zip picks are not limited.'),
  ('sponsored_max_geo_units', 10, 'payments', 'Sponsored area: max neighborhoods or zips',
   'Most neighborhoods or zip codes a sponsor can combine into one area.'),
  ('sponsored_circle_radius_min_ft', 100, 'payments', 'Sponsored area: min circle radius (ft)',
   'Radius limit for circle-shaped sponsored areas. Currently unused, since no screen offers circle areas.'),
  ('sponsored_circle_radius_max_ft', 1000, 'payments', 'Sponsored area: max circle radius (ft)',
   'Radius limit for circle-shaped sponsored areas. Currently unused, since no screen offers circle areas.')
ON CONFLICT (key) DO NOTHING;
