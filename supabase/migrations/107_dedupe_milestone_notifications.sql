-- Milestone notifications (points/cleanup-count/bag/pound) could fire more than once for
-- the same user+threshold. The contribution-count case is the clearest example: the
-- log-team-total endpoint wipes and fully re-splits an event's contributions on every
-- organizer resubmission, so a user's running cleanup count can revisit the same value
-- (e.g. 10) across several resubmissions, and notify_contribution_count_milestones() fired
-- again each time it did. Points milestones showed the same duplication after a batch
-- point-recalc on 2026-08-23, even with boundary-crossing logic, because a value that
-- moves non-monotonically can cross the same boundary more than once.
--
-- Rather than trying to make each trigger's crossing logic airtight against every possible
-- non-monotonic update, this gives every milestone notification a stable identity
-- (milestone_key) and reuses the same "insert once, ever" pattern already used for
-- offer_eligible notifications (see user_notifications_offer_eligible_once_idx in 063):
-- a partial unique index + ON CONFLICT DO NOTHING. milestone_key is left NULL on
-- pre-existing rows (no backfill needed) since the index only constrains rows that set it.
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS milestone_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_milestone_once_idx
  ON user_notifications (user_id, milestone_key)
  WHERE type = 'milestone' AND milestone_key IS NOT NULL;

CREATE OR REPLACE FUNCTION notify_points_milestones()
RETURNS TRIGGER AS $$
DECLARE
  thresholds NUMERIC[];
  t NUMERIC;
  offer RECORD;
BEGIN
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    SELECT ARRAY(SELECT value FROM game_settings WHERE key LIKE 'points_milestone_%' ORDER BY key) INTO thresholds;
    FOREACH t IN ARRAY thresholds LOOP
      IF OLD.points < t AND NEW.points >= t THEN
        INSERT INTO user_notifications (user_id, type, title, body, push_eligible, milestone_key)
        VALUES (
          NEW.id, 'milestone',
          'You hit ' || t || ' points!',
          'Keep it up — every contribution moves the needle.',
          false, 'points:' || t
        )
        ON CONFLICT (user_id, milestone_key) WHERE type = 'milestone' AND milestone_key IS NOT NULL DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  IF NEW.spendable_points IS DISTINCT FROM OLD.spendable_points THEN
    FOR offer IN
      SELECT po.id, po.title, pb.name AS business_name
      FROM partner_offers po
      JOIN partner_businesses pb ON pb.id = po.business_id
      WHERE po.redemption_mode = 'spend'
        AND po.status = 'active'
        AND now() >= po.starts_at
        AND (po.ends_at IS NULL OR now() < po.ends_at)
        AND OLD.spendable_points < po.points_cost
        AND NEW.spendable_points >= po.points_cost
    LOOP
      INSERT INTO user_notifications (user_id, type, title, body, offer_id, push_eligible)
      VALUES (
        NEW.id, 'offer_eligible',
        'You can now redeem: ' || offer.title,
        'You have enough points for this offer from ' || offer.business_name || '.',
        offer.id, false
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  IF NEW.points IS DISTINCT FROM OLD.points THEN
    FOR offer IN
      SELECT po.id, po.title, pb.name AS business_name
      FROM partner_offers po
      JOIN partner_businesses pb ON pb.id = po.business_id
      WHERE po.redemption_mode = 'threshold'
        AND po.status = 'active'
        AND now() >= po.starts_at
        AND (po.ends_at IS NULL OR now() < po.ends_at)
        AND OLD.points < po.points_threshold
        AND NEW.points >= po.points_threshold
    LOOP
      INSERT INTO user_notifications (user_id, type, title, body, offer_id, push_eligible)
      VALUES (
        NEW.id, 'offer_eligible',
        'You unlocked: ' || offer.title,
        'You''ve reached the points threshold for this offer from ' || offer.business_name || '.',
        offer.id, false
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_contribution_count_milestones()
RETURNS TRIGGER AS $$
DECLARE
  thresholds INT[];
  t INT;
  new_count INT;
  camp_slug TEXT;
BEGIN
  IF NEW.user_id IS NULL OR NEW.contribution_type != 'cleanup' THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(SELECT value::int FROM game_settings WHERE key LIKE 'contribution_count_milestone_%' ORDER BY key) INTO thresholds;

  SELECT COUNT(*) INTO new_count
  FROM contributions
  WHERE user_id = NEW.user_id AND campaign_id = NEW.campaign_id AND contribution_type = 'cleanup';

  FOREACH t IN ARRAY thresholds LOOP
    IF new_count = t THEN
      SELECT slug INTO camp_slug FROM campaigns WHERE id = NEW.campaign_id;
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug, push_eligible, milestone_key)
      VALUES (
        NEW.user_id, 'milestone',
        'That''s ' || t || ' cleanups!',
        'You''ve logged ' || t || ' cleanups in this campaign.',
        NEW.campaign_id, camp_slug, false,
        'cleanup_count:' || t || ':' || NEW.campaign_id
      )
      ON CONFLICT (user_id, milestone_key) WHERE type = 'milestone' AND milestone_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_cleanup_metric_milestones()
RETURNS TRIGGER AS $$
DECLARE
  bag_thresholds INT[];
  pound_thresholds NUMERIC[];
  t_int INT;
  t_num NUMERIC;
  prior_bags INT;
  prior_pounds NUMERIC;
  new_bags INT;
  new_pounds NUMERIC;
  camp_slug TEXT;
BEGIN
  IF NEW.submitted_by_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ARRAY(SELECT value::int FROM game_settings WHERE key LIKE 'cleanup_bag_milestone_%' ORDER BY key) INTO bag_thresholds;
  SELECT ARRAY(SELECT value FROM game_settings WHERE key LIKE 'cleanup_pound_milestone_%' ORDER BY key) INTO pound_thresholds;

  SELECT
    COALESCE(SUM(COALESCE(metrics_small_bags, 0) + COALESCE(metrics_large_bags, 0)), 0),
    COALESCE(SUM(COALESCE(metrics_pounds, 0)), 0)
  INTO prior_bags, prior_pounds
  FROM cleanups
  WHERE submitted_by_user_id = NEW.submitted_by_user_id
    AND campaign_id = NEW.campaign_id
    AND id != NEW.id;

  new_bags := prior_bags + COALESCE(NEW.metrics_small_bags, 0) + COALESCE(NEW.metrics_large_bags, 0);
  new_pounds := prior_pounds + COALESCE(NEW.metrics_pounds, 0);

  SELECT slug INTO camp_slug FROM campaigns WHERE id = NEW.campaign_id;

  FOREACH t_int IN ARRAY bag_thresholds LOOP
    IF prior_bags < t_int AND new_bags >= t_int THEN
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug, push_eligible, milestone_key)
      VALUES (
        NEW.submitted_by_user_id, 'milestone',
        'You''ve collected ' || t_int || ' bags of trash!',
        'Your cleanup work in this campaign just crossed ' || t_int || ' bags.',
        NEW.campaign_id, camp_slug, false,
        'bag:' || t_int || ':' || NEW.campaign_id
      )
      ON CONFLICT (user_id, milestone_key) WHERE type = 'milestone' AND milestone_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;

  FOREACH t_num IN ARRAY pound_thresholds LOOP
    IF prior_pounds < t_num AND new_pounds >= t_num THEN
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug, push_eligible, milestone_key)
      VALUES (
        NEW.submitted_by_user_id, 'milestone',
        'You''ve cleaned ' || t_num || ' lbs of trash!',
        'Your cleanup work in this campaign just crossed ' || t_num || ' pounds.',
        NEW.campaign_id, camp_slug, false,
        'pound:' || t_num || ':' || NEW.campaign_id
      )
      ON CONFLICT (user_id, milestone_key) WHERE type = 'milestone' AND milestone_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
