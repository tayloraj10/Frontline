-- The app is for Americans, so distances are shown in feet. Store the photo and on-site distances as the
-- closest whole meters to clean foot values: 500 ft (152 m) for jobs and 300 ft (91 m) for sponsored sites.
UPDATE game_settings SET value = 152 WHERE key = 'marketplace_site_radius_m' AND value = 150;
UPDATE game_settings SET value = 91 WHERE key = 'sponsored_claim_proximity_meters' AND value = 100;
