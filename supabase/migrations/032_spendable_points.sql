-- Splits the single `profiles.points` balance into two concepts:
--   points            -> lifetime earned total, never decreases. Global leaderboard
--                         (frontend /leaderboard) sorts on this, so redeeming a partner
--                         offer must not lower it — spending a reward you earned
--                         shouldn't cost you your rank.
--   spendable_points  -> redeemable balance. Increases with earning (same triggers as
--                         `points`), decreases when a partner offer is redeemed. This is
--                         the column `redeem_offer` now checks/deducts instead of `points`.
--
-- Backfilled from the existing `points` value so current balances carry over exactly.

ALTER TABLE profiles ADD COLUMN spendable_points NUMERIC NOT NULL DEFAULT 0;

UPDATE profiles SET spendable_points = points;

CREATE OR REPLACE FUNCTION sync_profile_points()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      UPDATE profiles
      SET points = points + contribution_points(NEW.contribution_type, NEW.value),
          spendable_points = spendable_points + contribution_points(NEW.contribution_type, NEW.value)
      WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      UPDATE profiles
      SET points = points - contribution_points(OLD.contribution_type, OLD.value),
          spendable_points = spendable_points - contribution_points(OLD.contribution_type, OLD.value)
      WHERE id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION sync_profile_points_from_report()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by_user_id IS NOT NULL THEN
      UPDATE profiles
      SET points = points + 1, spendable_points = spendable_points + 1
      WHERE id = NEW.submitted_by_user_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.submitted_by_user_id IS NOT NULL THEN
      UPDATE profiles
      SET points = points - 1, spendable_points = spendable_points - 1
      WHERE id = OLD.submitted_by_user_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
