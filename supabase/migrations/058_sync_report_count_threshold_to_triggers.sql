-- event_triggers.condition_config->>'threshold' and game_settings.report_count_threshold_default
-- had drifted into two disconnected sources of truth for the same number: the Trash War
-- trigger row was hand-set to 3, while the game_settings default sat unused at 5 (unused
-- because _check_report_triggers always prefers condition_config's threshold when a trigger
-- row exists at all). Going forward, game_settings is authoritative — editing the "Report-count
-- trigger default threshold" setting in the admin UI now also writes through to every
-- report_count event_triggers row, so there's one place to change this instead of two.

CREATE OR REPLACE FUNCTION sync_report_count_threshold_to_event_triggers()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.key = 'report_count_threshold_default' AND NEW.value IS DISTINCT FROM OLD.value THEN
    UPDATE event_triggers
    SET condition_config = jsonb_set(COALESCE(condition_config, '{}'::jsonb), '{threshold}', to_jsonb(NEW.value))
    WHERE condition_type = 'report_count';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_report_count_threshold ON game_settings;
CREATE TRIGGER trg_sync_report_count_threshold
AFTER UPDATE ON game_settings
FOR EACH ROW
EXECUTE FUNCTION sync_report_count_threshold_to_event_triggers();

-- Backfill: make game_settings' existing default (5) the live value everywhere, replacing
-- Trash War's hand-set 3. Chosen deliberately over the reverse (keeping 3) — confirmed with
-- the user 2026-08-03.
UPDATE event_triggers
SET condition_config = jsonb_set(COALESCE(condition_config, '{}'::jsonb), '{threshold}', to_jsonb(
  (SELECT value FROM game_settings WHERE key = 'report_count_threshold_default')
))
WHERE condition_type = 'report_count';
