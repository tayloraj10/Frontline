# Push Notifications — Prod Deploy Checklist

Revisit this when actually shipping the mobile app (or earlier — see note below, this is safe to do any time).

## Why this is safe to do before the mobile app is live

- `062_push_notification_webhook.sql`'s trigger reads the function URL + service_role key from Supabase Vault (`vault.decrypted_secrets`) and no-ops if either secret isn't populated yet — applying the migration changes nothing until those two Vault secrets exist.
- Even once armed, the trigger fires on every `user_notifications` insert and looks up `device_tokens` for that user. Until a real mobile build exists and someone has logged in on it, that table is empty, so every attempt just returns `{"sent":0}` — no error, nothing user-visible.
- The only thing that actually matters getting right before the *first real device token* exists is the Firebase secret name (see below) — a wrong name means the first live push throws instead of sending. Low-stakes (a logged error, not user-facing), but worth confirming once.

## Why Vault, not `ALTER DATABASE ... SET`

Custom placeholder GUCs (`app.settings.*`) require real Postgres superuser to set via `ALTER DATABASE ... SET`. Neither local nor hosted Supabase's `postgres` role actually has superuser (confirmed locally: `usesuper = f`), so that approach fails with "permission denied to set parameter" in both places — not just prod. Vault is Supabase's standard mechanism for exactly this (secrets readable from SQL/triggers without superuser), and it works identically in local and hosted Supabase.

**Tradeoff to know about**: Vault secrets live inside the actual database, so a `supabase db reset` — or a new dev's first local setup — wipes them just like any other table's data. There's no way around this for something that must be a genuine secret (it can't go in a migration file, since that's committed to git). Repopulating after a reset or fresh clone just means re-running the two `vault.create_secret` calls below once.

## Steps, in order

1. **Confirm the Firebase secret name** in the Supabase dashboard (Edge Functions → Secrets, prod project `nvidlxyzyoxzalxbydvg`). `supabase/functions/send-push/index.ts` reads `Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON")` — if the dashboard secret was saved under a different name, either rename it there or update the code to match.

2. **Deploy the Edge Function**:
   ```
   supabase functions deploy send-push --project-ref nvidlxyzyoxzalxbydvg
   ```
   Inert until called — no DB wiring yet.

3. **Apply the migration** (`062_push_notification_webhook.sql`) to prod via the normal migration process. Inert until the Vault secrets below are populated.

4. **Arm the trigger** by populating the two Vault secrets on the prod DB (run once, never committed — same handling as the Firebase JSON):
   ```sql
   select vault.create_secret('https://nvidlxyzyoxzalxbydvg.supabase.co/functions/v1/send-push', 'push_function_url');
   select vault.create_secret('<prod service_role key from Settings -> API>', 'push_service_role_key');
   ```
   Takes effect immediately — no restart or reconnect needed, unlike the old GUC approach.

## Local setup / after any db reset

Local Vault secrets don't survive `supabase db reset` (see tradeoff above). Repopulate with:
```sql
select vault.create_secret('http://127.0.0.1:54321/functions/v1/send-push', 'push_function_url');
select vault.create_secret('<local service_role key from `supabase status`>', 'push_service_role_key');
```
The Firebase secret also needs to exist locally for the Edge Function itself to send (separately from the trigger secrets above) — e.g. via a local `supabase/functions/.env` with `FIREBASE_SERVICE_ACCOUNT_JSON=<the service account JSON>`, not committed.

## Still blocked regardless of the above

- **Android manual test pass** — needs a real device or build; can't be verified from this Windows dev environment.
- **iOS test pass** — blocked on `ios/` platform scaffolding, which needs to happen on the Mac (see `ios-setup-2026-08-06.md`).

## Reference

- Prod project ref: `nvidlxyzyoxzalxbydvg` (from `backend/.env.prod` — that file also has a live DB password, never echo/commit it).
