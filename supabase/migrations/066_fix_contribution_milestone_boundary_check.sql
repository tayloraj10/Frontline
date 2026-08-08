-- notify_contribution_count_milestones used strict equality (new_count = t) to
-- decide whether a threshold was just crossed, unlike every other milestone
-- function in 065 (points, bags, pounds), which uses a prior/new range check.
-- Recomputing new_count via a fresh COUNT(*) means it always advances by
-- exactly 1 per row today, so this isn't currently reachable — but it silently
-- stops firing the moment that assumption breaks (e.g. a future bulk-import
-- path that increments the count by more than 1 at once). Switching to the
-- same range-check pattern costs nothing and removes the fragility.

CREATE OR REPLACE FUNCTION notify_contribution_count_milestones()
RETURNS TRIGGER AS $$
DECLARE
  thresholds INT[] := ARRAY[5, 10, 25, 50, 100];
  t INT;
  prior_count INT;
  new_count INT;
  camp_slug TEXT;
BEGIN
  IF NEW.user_id IS NULL OR NEW.contribution_type != 'cleanup' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO new_count
  FROM contributions
  WHERE user_id = NEW.user_id AND campaign_id = NEW.campaign_id AND contribution_type = 'cleanup';

  prior_count := new_count - 1;

  FOREACH t IN ARRAY thresholds LOOP
    IF prior_count < t AND new_count >= t THEN
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
