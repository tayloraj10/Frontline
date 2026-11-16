-- Sponsored sites can now be claimed from anywhere, like marketplace jobs. The "before" window becomes the
-- travel time: how long a claimant has to get to the site and take the starting photo. Proximity is still
-- enforced when the before and after photos are submitted. Jobs and sites both give one hour.
UPDATE game_settings
SET value = 60,
    label = 'Sponsored site: travel window (minutes)',
    description = 'How long a claimant has to get to a sponsored site and submit the starting photo after claiming it.'
WHERE key = 'sponsored_claim_before_window_minutes' AND value IN (30, 120);

UPDATE game_settings
SET value = 60
WHERE key = 'marketplace_arrive_minutes' AND value = 120;

UPDATE game_settings
SET description = 'How close a claimant must be to the sponsored site to submit the starting and after photos.'
WHERE key = 'sponsored_claim_proximity_meters';
