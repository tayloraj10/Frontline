-- Adds a 'general' sponsorship target (payments use case 3 addendum: a GoFundMe-style
-- one-off donation to the mission overall, not tied to a specific cleanup or area).
-- Same funding-only, admin-only-for-now scope as the rest of sponsorships.

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_type_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_type_check
  CHECK (target_type IN ('cleanup_event', 'geo_unit', 'general'));

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_one_of;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_one_of CHECK (
  (target_type = 'cleanup_event' AND target_cleanup_id IS NOT NULL AND target_geo_unit_id IS NULL)
  OR (target_type = 'geo_unit' AND target_geo_unit_id IS NOT NULL AND target_cleanup_id IS NULL)
  OR (target_type = 'general' AND target_cleanup_id IS NULL AND target_geo_unit_id IS NULL)
);
