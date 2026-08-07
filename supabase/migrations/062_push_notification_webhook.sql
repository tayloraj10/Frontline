-- Fires the send-push Edge Function whenever a row lands in user_notifications,
-- so every existing insert point (the two DB triggers plus the two FastAPI
-- direct-inserts) gets a push for free without duplicating send logic per path.
-- See dev-docs/push-notifications-scoping-2026-08-06.md, option 2.
--
-- Reads the function URL + service_role key from Supabase Vault rather than
-- app.settings GUCs — ALTER DATABASE ... SET on a custom placeholder GUC
-- requires real Postgres superuser, which neither local nor hosted Supabase's
-- "postgres" role has. Vault secrets ('push_function_url' / 'push_service_role_key')
-- are populated by hand (see dev-docs/push-notifications-prod-deploy-checklist.md
-- for the exact commands) — not part of this migration, since that would commit
-- a secret. Silently no-ops until they're populated, e.g. right after a fresh
-- db reset or a new dev's first local setup.
CREATE OR REPLACE FUNCTION notify_push_on_user_notification()
RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  service_role_key TEXT;
BEGIN
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

CREATE TRIGGER on_user_notification_insert_push
  AFTER INSERT ON user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_user_notification();
