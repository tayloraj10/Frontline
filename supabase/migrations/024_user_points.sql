-- Persistent per-user points total, normalized per contribution type so campaigns
-- with very different internal scoring don't dominate the cross-campaign total.
-- The raw `contributions.value` column stays untouched — it still drives in-campaign
-- territory_claims/leaderboards/hex-bloom thresholds, which need their own
-- larger/differently-shaped scales (e.g. solarpunk_action ranges 5-48 per action).
--   cleanup (Trash War)        -> value (already bag-weighted: small=1, large=3)
--   photo (Touch Grass)        -> value (already flat 1)
--   solarpunk_photo            -> flat 1 (overrides in-campaign value of 2)
--   solarpunk_action           -> flat 2 (overrides in-campaign value of 5-48)
--   everything else            -> 0 (road-to-independence's civic_action, brainrot's unfollow)
-- Trash War problem reports also earn points (1 each) even though they were never
-- rows in `contributions`.
--
-- Triggers on both `contributions` and `problem_reports` keep this in sync
-- regardless of insertion path (the main /submit endpoint, its solarpunk
-- cross-campaign bonus insert, seeders, problem report submission), and
-- self-correct on delete.

ALTER TABLE profiles ADD COLUMN points NUMERIC NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION contribution_points(p_contribution_type TEXT, p_value NUMERIC)
RETURNS NUMERIC AS $$
  SELECT CASE p_contribution_type
    WHEN 'cleanup' THEN COALESCE(p_value, 0)
    WHEN 'photo' THEN COALESCE(p_value, 0)
    WHEN 'solarpunk_photo' THEN 1
    WHEN 'solarpunk_action' THEN 2
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION sync_profile_points()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      UPDATE profiles SET points = points + contribution_points(NEW.contribution_type, NEW.value) WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      UPDATE profiles SET points = points - contribution_points(OLD.contribution_type, OLD.value) WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_contribution_points_sync
  AFTER INSERT OR DELETE ON contributions
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_points();

CREATE OR REPLACE FUNCTION sync_profile_points_from_report()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by_user_id IS NOT NULL THEN
      UPDATE profiles SET points = points + 1 WHERE id = NEW.submitted_by_user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.submitted_by_user_id IS NOT NULL THEN
      UPDATE profiles SET points = points - 1 WHERE id = OLD.submitted_by_user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_problem_report_points_sync
  AFTER INSERT OR DELETE ON problem_reports
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_points_from_report();

-- Backfill from existing history
UPDATE profiles p
SET points = COALESCE(sub.total, 0)
FROM (
  SELECT user_id, SUM(contribution_points(contribution_type, value)) AS total
  FROM contributions
  WHERE user_id IS NOT NULL
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;

UPDATE profiles p
SET points = points + sub.total
FROM (
  SELECT submitted_by_user_id, COUNT(*) AS total
  FROM problem_reports
  WHERE submitted_by_user_id IS NOT NULL
  GROUP BY submitted_by_user_id
) sub
WHERE p.id = sub.submitted_by_user_id;

CREATE INDEX idx_profiles_points ON profiles (points DESC);
