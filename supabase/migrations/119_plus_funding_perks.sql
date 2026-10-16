-- Frontline Plus funding perks (payments v2 follow-up).
-- 1. Early access: a newly funded sponsored pool is claimable by Plus members (users for
--    sites, groups for group areas) for a window before it opens to everyone.
-- 2. Group earning caps: group-area allocations get a per-group-per-pool cap, lifted by the
--    existing Plus multiplier for Plus groups.
-- 3. Group sponsorship: a Plus group can open itself to direct sponsors. A funded
--    'group_support' pool pays the whole amount to the group via one direct allocation that
--    goes through the same admin review and manual payout as every other allocation.

-- 1. When a pool became funded (the early access window is measured from here).
ALTER TABLE sponsorships ADD COLUMN funded_at timestamptz;
UPDATE sponsorships SET funded_at = updated_at WHERE status IN ('funded', 'exhausted', 'released') AND funded_at IS NULL;

-- 3. Group sponsorship.
ALTER TABLE groups ADD COLUMN open_to_sponsors boolean NOT NULL DEFAULT false;
ALTER TABLE groups ADD COLUMN sponsor_pitch text CHECK (sponsor_pitch IS NULL OR char_length(sponsor_pitch) <= 400);

ALTER TABLE sponsorships ADD COLUMN target_group_id UUID REFERENCES groups(id);
CREATE INDEX sponsorships_target_group_idx ON sponsorships(target_group_id) WHERE target_group_id IS NOT NULL;

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_model_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_model_check
  CHECK (model IN ('general', 'site', 'group_area', 'group_support'));

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_type_check;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_type_check
  CHECK (target_type IN ('cleanup_event', 'geo_unit', 'general', 'site', 'area', 'group'));

ALTER TABLE sponsorships DROP CONSTRAINT sponsorships_target_one_of;
ALTER TABLE sponsorships ADD CONSTRAINT sponsorships_target_one_of CHECK (
  (target_type = 'cleanup_event' AND target_cleanup_id IS NOT NULL AND target_geo_unit_id IS NULL AND target_group_id IS NULL)
  OR (target_type = 'geo_unit' AND target_geo_unit_id IS NOT NULL AND target_cleanup_id IS NULL AND target_group_id IS NULL)
  OR (target_type IN ('general', 'site', 'area') AND target_cleanup_id IS NULL AND target_geo_unit_id IS NULL AND target_group_id IS NULL)
  OR (target_type = 'group' AND target_group_id IS NOT NULL AND target_cleanup_id IS NULL AND target_geo_unit_id IS NULL)
);

-- A direct allocation has no claim or event behind it: the sponsor funded the group itself.
ALTER TABLE sponsorship_allocations ADD COLUMN is_direct boolean NOT NULL DEFAULT false;
ALTER TABLE sponsorship_allocations DROP CONSTRAINT sponsorship_allocations_source_one_of;
ALTER TABLE sponsorship_allocations ADD CONSTRAINT sponsorship_allocations_source_one_of
  CHECK (claim_id IS NOT NULL OR cleanup_id IS NOT NULL OR (is_direct AND group_id IS NOT NULL));

-- Tunable settings.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('plus_early_access_hours', 48, 'payments', 'Frontline Plus: sponsored early access (hours)', 'How long a newly funded sponsored site or group area is reserved for Plus members before it opens to everyone. 0 disables the perk.'),
  ('sponsored_default_cap_per_group_cents', 10000, 'payments', 'Sponsored: default per-group cap (cents)', 'Default maximum one group can earn from a single group-area pool. Plus groups get this multiplied by the Plus earning cap multiplier.')
ON CONFLICT (key) DO NOTHING;
