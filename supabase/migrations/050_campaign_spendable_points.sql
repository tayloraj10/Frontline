-- Restricts which campaigns' contributions/reports feed the *redeemable*
-- spendable_points balance, per admin decision (dev-backlog-2026-07-24.md #6):
-- partner offers are only advertised against Trash War right now, so earning
-- points in other campaigns (Solarpunk, BRAINROT, etc.) shouldn't grow a
-- balance redeemable against those offers. Lifetime `points` (leaderboard)
-- is untouched and keeps counting every campaign as before.
--
-- `counts_toward_spendable_points` is a per-campaign admin toggle (not
-- hardcoded to campaign_type) so more campaigns can be added to the pool
-- later without another migration. Trash War is enabled by default since
-- it's the only campaign that currently counts.

ALTER TABLE campaigns ADD COLUMN counts_toward_spendable_points BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE campaigns SET counts_toward_spendable_points = TRUE WHERE slug = 'trash-war';

CREATE OR REPLACE FUNCTION sync_profile_points()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      UPDATE profiles
      SET points = points + contribution_points(NEW.contribution_type, NEW.value)
      WHERE id = NEW.user_id;

      IF EXISTS (
        SELECT 1 FROM campaigns WHERE id = NEW.campaign_id AND counts_toward_spendable_points
      ) THEN
        UPDATE profiles
        SET spendable_points = spendable_points + contribution_points(NEW.contribution_type, NEW.value)
        WHERE id = NEW.user_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      UPDATE profiles
      SET points = points - contribution_points(OLD.contribution_type, OLD.value)
      WHERE id = OLD.user_id;

      IF EXISTS (
        SELECT 1 FROM campaigns WHERE id = OLD.campaign_id AND counts_toward_spendable_points
      ) THEN
        UPDATE profiles
        SET spendable_points = spendable_points - contribution_points(OLD.contribution_type, OLD.value)
        WHERE id = OLD.user_id;
      END IF;
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
      UPDATE profiles SET points = points + 1 WHERE id = NEW.submitted_by_user_id;

      IF EXISTS (
        SELECT 1 FROM campaigns WHERE id = NEW.campaign_id AND counts_toward_spendable_points
      ) THEN
        UPDATE profiles SET spendable_points = spendable_points + 1 WHERE id = NEW.submitted_by_user_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.submitted_by_user_id IS NOT NULL THEN
      UPDATE profiles SET points = points - 1 WHERE id = OLD.submitted_by_user_id;

      IF EXISTS (
        SELECT 1 FROM campaigns WHERE id = OLD.campaign_id AND counts_toward_spendable_points
      ) THEN
        UPDATE profiles SET spendable_points = spendable_points - 1 WHERE id = OLD.submitted_by_user_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: existing spendable_points balances are NOT retroactively corrected here.
-- Balances already include credit earned from non-Trash-War contributions prior
-- to this migration; whether to claw that back is an open decision (see
-- dev-backlog-2026-07-24.md #6). The admin "toggle campaign" endpoint added
-- alongside this migration recomputes affected users' balances at the moment
-- a campaign's flag is changed, going forward.
