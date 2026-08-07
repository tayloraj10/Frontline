-- Notification system overhaul:
--   1. push_eligible column so a notification can be inbox-only (no FCM push).
--   2. Reworks notify_territory_claimed() into "leader" language, keyed off the
--      geo_unit's actual unit_type instead of a hardcoded "territory" framing.
--   3. New achievement-style notifications ('milestone', 'offer_eligible'), fired
--      from a single AFTER UPDATE OF points, spendable_points trigger on profiles
--      (catches every points-mutation path: contribution/report triggers, admin
--      adjustments, partner-offer redemption spend) plus dedicated triggers for
--      per-campaign contribution-count and cleanup bag/pound milestones.
-- See notifications audit + achievements design discussion, 2026-08-07.

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

ALTER TABLE user_notifications
  ADD COLUMN push_eligible BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN offer_id UUID REFERENCES partner_offers(id) ON DELETE CASCADE;

COMMENT ON COLUMN user_notifications.type IS
  'event | tract_claimed | milestone | points_adjusted | claim_expired | offer_eligible';

-- One offer_eligible notification per (user, offer) ever, regardless of read state.
CREATE UNIQUE INDEX user_notifications_offer_eligible_once_idx
  ON user_notifications(user_id, offer_id)
  WHERE type = 'offer_eligible';

-- ---------------------------------------------------------------------------
-- 2. Gate the push webhook on push_eligible
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_push_on_user_notification()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  service_role_key TEXT;
BEGIN
  IF NOT NEW.push_eligible THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO function_url FROM vault.decrypted_secrets WHERE name = 'push_function_url';
  SELECT decrypted_secret INTO service_role_key FROM vault.decrypted_secrets WHERE name = 'push_service_role_key';

  IF function_url IS NULL OR service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. tract_claimed -> "leader" rework, unit-type-aware, inbox-only (no push)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_territory_claimed()
RETURNS TRIGGER AS $$
DECLARE
  unit_type TEXT;
  unit_id TEXT;
  display_name TEXT;
  title_text TEXT;
BEGIN
  IF NEW.claimed_by_user IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.claimed_by_user IS DISTINCT FROM NEW.claimed_by_user) THEN

    SELECT gu.unit_type, gu.unit_id, gu.display_name
    INTO unit_type, unit_id, display_name
    FROM geo_units gu WHERE gu.id = NEW.geo_unit_id;

    title_text := CASE unit_type
      WHEN 'zip' THEN 'You''re now the leader in ZIP ' || unit_id
      WHEN 'uk_postcode_district' THEN 'You''re now the leader in postcode ' || unit_id
      WHEN 'census_tract' THEN 'You''re now the leader in ' || COALESCE(display_name, 'census tract ' || unit_id)
      WHEN 'state' THEN 'You''re now the leader in ' || COALESCE(display_name, unit_id)
      ELSE 'You''re now the leader in ' || COALESCE(display_name, unit_id, 'this area')
    END;

    INSERT INTO user_notifications (user_id, type, title, campaign_id, campaign_slug, push_eligible)
    SELECT
      NEW.claimed_by_user,
      'tract_claimed',
      title_text,
      NEW.campaign_id,
      camps.slug,
      false
    FROM campaigns camps
    WHERE camps.id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 4. Milestone + offer-eligibility trigger on profiles points changes
-- ---------------------------------------------------------------------------
-- Threshold ladders are placeholder defaults, easy to retune later.

CREATE OR REPLACE FUNCTION notify_points_milestones()
RETURNS TRIGGER AS $$
DECLARE
  thresholds NUMERIC[] := ARRAY[100, 500, 1000, 2500, 5000, 10000];
  t NUMERIC;
  offer RECORD;
BEGIN
  -- Lifetime points milestones (points is monotonic in normal flow, but admin
  -- adjustments can move it either way, so we check both directions explicitly).
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    FOREACH t IN ARRAY thresholds LOOP
      IF OLD.points < t AND NEW.points >= t THEN
        INSERT INTO user_notifications (user_id, type, title, body)
        VALUES (
          NEW.id, 'milestone',
          'You hit ' || t || ' points!',
          'Keep it up — every contribution moves the needle.'
        );
      END IF;
    END LOOP;
  END IF;

  -- Offer eligibility: any active offer whose cost/threshold this user just
  -- crossed via either a 'spend' comparison (spendable_points) or a
  -- 'threshold' comparison (lifetime points, no deduction).
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
      INSERT INTO user_notifications (user_id, type, title, body, offer_id)
      VALUES (
        NEW.id, 'offer_eligible',
        'You can now redeem: ' || offer.title,
        'You have enough points for this offer from ' || offer.business_name || '.',
        offer.id
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
      INSERT INTO user_notifications (user_id, type, title, body, offer_id)
      VALUES (
        NEW.id, 'offer_eligible',
        'You unlocked: ' || offer.title,
        'You''ve reached the points threshold for this offer from ' || offer.business_name || '.',
        offer.id
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_points_change
  AFTER UPDATE OF points, spendable_points ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_points_milestones();

-- ---------------------------------------------------------------------------
-- 5. Per-campaign contribution-count milestones
-- ---------------------------------------------------------------------------

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
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug)
      VALUES (
        NEW.user_id, 'milestone',
        'That''s ' || t || ' cleanups!',
        'You''ve logged ' || t || ' cleanups in this campaign.',
        NEW.campaign_id, camp_slug
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_contribution_count_milestone
  AFTER INSERT ON contributions
  FOR EACH ROW
  EXECUTE FUNCTION notify_contribution_count_milestones();

-- ---------------------------------------------------------------------------
-- 6. Per-campaign bags/pounds metric milestones (from cleanups, not contributions)
-- ---------------------------------------------------------------------------

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
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug)
      VALUES (
        NEW.submitted_by_user_id, 'milestone',
        'You''ve collected ' || t_int || ' bags of trash!',
        'Your cleanup work in this campaign just crossed ' || t_int || ' bags.',
        NEW.campaign_id, camp_slug
      );
    END IF;
  END LOOP;

  FOREACH t_num IN ARRAY pound_thresholds LOOP
    IF prior_pounds < t_num AND new_pounds >= t_num THEN
      INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug)
      VALUES (
        NEW.submitted_by_user_id, 'milestone',
        'You''ve cleaned ' || t_num || ' lbs of trash!',
        'Your cleanup work in this campaign just crossed ' || t_num || ' pounds.',
        NEW.campaign_id, camp_slug
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_cleanup_metric_milestone
  AFTER INSERT ON cleanups
  FOR EACH ROW
  EXECUTE FUNCTION notify_cleanup_metric_milestones();
