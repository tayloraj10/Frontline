-- Sponsored sites use the same 500 ft (152 m) photo distance as jobs, which leaves room for weak GPS.
-- The backend also never goes below this, even for sites a sponsor drew smaller.
UPDATE game_settings SET value = 152 WHERE key = 'sponsored_claim_proximity_meters' AND value = 91;
