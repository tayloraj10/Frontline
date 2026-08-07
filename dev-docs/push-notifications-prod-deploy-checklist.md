# Push Notifications — Prod Deploy Checklist

Revisit this when actually shipping the mobile app (or earlier — see note below, this is safe to do any time).

## Why this is safe to do before the mobile app is live

- `062_push_notification_webhook.sql`'s trigger checks `app.settings.push_function_url` / `app.settings.service_role_key` and no-ops if either is unset — applying the migration changes nothing until the GUCs are set.
- Even once armed, the trigger fires on every `user_notifications` insert and looks up `device_tokens` for that user. Until a real mobile build exists and someone has logged in on it, that table is empty, so every attempt just returns `{"sent":0}` — no error, nothing user-visible.
- The only thing that actually matters getting right before the *first real device token* exists is the Firebase secret name (see below) — a wrong name means the first live push throws instead of sending. Low-stakes (a logged error, not user-facing), but worth confirming once.

## Steps, in order

1. **Confirm the Firebase secret name** in the Supabase dashboard (Edge Functions → Secrets, prod project `nvidlxyzyoxzalxbydvg`). `supabase/functions/send-push/index.ts` reads `Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")` — if the dashboard secret was saved under a different name, either rename it there or update the code to match.

2. **Deploy the Edge Function**:
   ```
   supabase functions deploy send-push --project-ref nvidlxyzyoxzalxbydvg
   ```
   Inert until called — no DB wiring yet.

3. **Apply the migration** (`062_push_notification_webhook.sql`) to prod via the normal migration process. Inert until the GUCs below are set.

4. **Arm the trigger** by setting the two GUCs on the prod DB (never committed — same handling as the Firebase JSON, these are secrets):
   ```sql
   ALTER DATABASE postgres SET app.settings.push_function_url = 'https://nvidlxyzyoxzalxbydvg.supabase.co/functions/v1/send-push';
   ALTER DATABASE postgres SET app.settings.service_role_key = '<prod service_role key from Settings -> API>';
   ```
   These apply to new connections after being set — no restart needed, but requires a fresh connection to take effect on an existing session.

## Still blocked regardless of the above

- **Android manual test pass** — needs a real device or build; can't be verified from this Windows dev environment.
- **iOS test pass** — blocked on `ios/` platform scaffolding, which needs to happen on the Mac (see `ios-setup-2026-08-06.md`).

## Reference

- Prod project ref: `nvidlxyzyoxzalxbydvg` (from `backend/.env.prod` — that file also has a live DB password, never echo/commit it).
- Local equivalent for testing this flow locally: `ALTER DATABASE postgres SET app.settings.push_function_url = 'http://127.0.0.1:54321/functions/v1/send-push';` + the local service_role key from `supabase status`.
