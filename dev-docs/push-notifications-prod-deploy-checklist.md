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

## Local setup (new repo clone, or after any `supabase db reset`)

Neither of the two pieces below is in git — a fresh clone has zero push-notification config until you do this. Both also need repeating any time local Vault secrets get wiped (a `supabase db reset` clears them, same as any other table's data).

**1. Get the Firebase service-account JSON.** This is a shared credential for the whole `frontline-498904` Firebase project, not something each dev generates independently — ask whoever has Firebase console access (Project Settings → Service Accounts) for the existing key file, or have them generate a new one for you there (Firebase allows multiple active keys, so a new key doesn't invalidate anyone else's). Do not commit this file or paste its contents into a tracked file.

**2. Create `supabase/functions/.env`** (already covered by the repo's `.env*` gitignore rule) with the JSON compacted onto one line as a single env var:
```
FIREBASE_SERVICE_ACCOUNT_JSON='<paste the entire downloaded JSON file's contents here, as-is>'
```
`supabase functions serve` picks this file up automatically — no extra flag needed. This only feeds the Edge Function itself; it's unrelated to the two Vault secrets below.

**3. Start the local Supabase stack** if it isn't already running: `supabase start`. Get your local `service_role` key from its output (or `supabase status`) — it's the `SERVICE_ROLE_KEY` field, different from the anon key.

**4. Populate the two Vault secrets** that arm the DB trigger (run against the local DB, `postgresql://postgres:postgres@127.0.0.1:54322/postgres` by default):
```sql
select vault.create_secret('http://kong:8000/functions/v1/send-push', 'push_function_url');
select vault.create_secret('<local service_role key from step 3>', 'push_service_role_key');
```
`push_function_url` must use `kong:8000` (the Kong gateway's Docker network alias), **not** `127.0.0.1:54321`. The trigger's `net.http_post` call runs from *inside* the `supabase_db` container, where `127.0.0.1` refers to that container itself — `kong:8000` is reachable from there, `127.0.0.1:54321` is not (connection refused), even though the latter works fine when curled from the host. These are unrelated to Firebase — they're what let the Postgres trigger call the Edge Function at all. Both are required; the trigger no-ops silently if either is missing (check with `select name from vault.decrypted_secrets;`).

**5. Verify it end-to-end** without needing a real emulator/device: run `supabase functions serve --no-verify-jwt`, insert a test row into `user_notifications` for a real user, insert a matching fake row into `device_tokens` for that user, then `curl -X POST http://127.0.0.1:54321/functions/v1/send-push -d '{"notification_id":"<the id>"}'`. A fake token gets rejected by FCM and pruned automatically (`{"sent":0}` is the *correct* result for a fake token, not a failure — it means the Firebase secret parsed and the call actually reached FCM). Clean up both test rows afterward.

## Still blocked regardless of the above

- **Android manual test pass** — needs a real device or build; can't be verified from this Windows dev environment.
- **iOS test pass** — blocked on `ios/` platform scaffolding, which needs to happen on the Mac (see `ios-setup-2026-08-06.md`).

## Reference

- Prod project ref: `nvidlxyzyoxzalxbydvg` (from `backend/.env.prod` — that file also has a live DB password, never echo/commit it).
