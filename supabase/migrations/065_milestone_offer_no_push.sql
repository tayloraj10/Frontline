-- milestone and offer_eligible notifications fire from the same trigger as the
-- user's own real-time action (submitting a contribution/cleanup, or crossing
-- a spend/threshold via their own points change) -- the app is guaranteed to
-- already be open when these happen, so a push is redundant with the in-app
-- AchievementModal/bell UI. Same reasoning already applied to tract_claimed
-- in 063. Campaign events, admin points_adjusted, and claim_expired remain
-- push-eligible since those genuinely happen while the user may be away.

CREATE OR REPLACE FUNCTION notify_points_milestones()
RETURNS TRIGGER AS $$
DECLARE
  thresholds NUMERIC[] := ARRAY[100, 500, 1000, 2500, 5000, 10000];
  t NUMERIC;
  offer RECORD;
BEGIN
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    FOREACH t IN ARRAY thresholds LOOP
      IF OLD.points < t AND NEW.points >= t THEN
        INSERT INTO user_notifications (user_id, type, title, body, push_eligible)
        VALUES (
          NEW.id, 'milestone',
          'You hit ' || t || ' points!',
          'Keep it up — every contribution moves the needle.',
          false
        );
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
  thresholds INT[] := ARRAY[5, 10, 25, 50, 100];
  t INT;
  new_count INT;
  camp_slug TEXT;
BEGIN
  IF NEW.user_id IS NULL OR NEW.contribution_type != 'cleanup' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO new_count
  FROM contributions
  WHERE user_id = NEW.user_id AND campaign_id = NEW.campaign_id AND contribution_type = 'cleanup';

  FOREACH t IN ARRAY thresholds LOOP
    IF new_count = t THEN
      SELECT slug INTO camp_slug FROM campaigns WHERE id = NEW.campaign_id;
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug, push_eligible)
      VALUES (
        NEW.user_id, 'milestone',
        'That''s ' || t || ' cleanups!',
        'You''ve logged ' || t || ' cleanups in this campaign.',
        NEW.campaign_id, camp_slug, false
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION notify_cleanup_metric_milestones()
RETURNS TRIGGER AS $$
DECLARE
  bag_thresholds INT[] := ARRAY[10, 25, 50, 100];
  pound_thresholds NUMERIC[] := ARRAY[100, 500, 1000];
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
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug, push_eligible)
      VALUES (
        NEW.submitted_by_user_id, 'milestone',
        'You''ve collected ' || t_int || ' bags of trash!',
        'Your cleanup work in this campaign just crossed ' || t_int || ' bags.',
        NEW.campaign_id, camp_slug, false
      );
    END IF;
  END LOOP;

  FOREACH t_num IN ARRAY pound_thresholds LOOP
    IF prior_pounds < t_num AND new_pounds >= t_num THEN
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug, push_eligible)
      VALUES (
        NEW.submitted_by_user_id, 'milestone',
        'You''ve cleaned ' || t_num || ' lbs of trash!',
        'Your cleanup work in this campaign just crossed ' || t_num || ' pounds.',
        NEW.campaign_id, camp_slug, false
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
