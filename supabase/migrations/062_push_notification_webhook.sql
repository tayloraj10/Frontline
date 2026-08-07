-- Fires the send-push Edge Function whenever a row lands in user_notifications,
-- so every existing insert point (the two DB triggers plus the two FastAPI
-- direct-inserts) gets a push for free without duplicating send logic per path.
-- See dev-docs/push-notifications-scoping-2026-08-06.md, option 2.
--
-- Requires app.settings.push_function_url and app.settings.service_role_key to
-- be set via ALTER DATABASE ... SET ... (not committed here — same handling as
-- the Firebase Admin SDK service account JSON, which is a Supabase secret, not
-- a migration). Silently no-ops until those are set, e.g. on a fresh local db.
CREATE OR REPLACE FUNCTION notify_push_on_user_notification()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT := current_setting('app.settings.push_function_url', true);
  service_role_key TEXT := current_setting('app.settings.service_role_key', true);
BEGIN
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

CREATE TRIGGER on_user_notification_insert_push
  AFTER INSERT ON user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_user_notification();
