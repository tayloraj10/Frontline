-- Cache first-action-bonus eligibility on profiles instead of re-deriving it from
-- contributions on every check. has_prior_contribution() scans all of a user's
-- contribution rows (contributions only has a plain user_id index, no compound
-- (user_id, contribution_type) index) and was being called on every cleanup-modal
-- open and every event-detail page load, forever, even for users who could never
-- be eligible again after their first action. These columns also double as
-- new-user metrics (when a user hit each milestone).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_cleanup_bonus_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_checkin_bonus_claimed_at TIMESTAMPTZ;

-- Backfill from existing history so users who already logged a cleanup or checked
-- in before this migration aren't shown as newly-eligible.
UPDATE profiles p
SET first_cleanup_bonus_claimed_at = c.first_at
FROM (
  SELECT user_id, MIN(submitted_at) AS first_at
  FROM contributions
  WHERE contribution_type = 'cleanup'
  GROUP BY user_id
) c
WHERE c.user_id = p.id
  AND p.first_cleanup_bonus_claimed_at IS NULL;

UPDATE profiles p
SET first_checkin_bonus_claimed_at = c.first_at
FROM (
  SELECT user_id, MIN(submitted_at) AS first_at
  FROM contributions
  WHERE contribution_type = 'cleanup_event_checkin'
  GROUP BY user_id
) c
WHERE c.user_id = p.id
  AND p.first_checkin_bonus_claimed_at IS NULL;
