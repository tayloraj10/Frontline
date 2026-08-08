# Push Notifications Scoping — 2026-08-06

Scopes work-breakdown item #6 in `capacitor-scoping-2026-08-04.md` (the other App Store "minimum native functionality" item alongside the share sheet, which is done). Branch: `phase2/capacitor-scoping`.

## What already exists (this is not starting from zero)

The app already has a full in-app notification system that push can piggyback on instead of inventing new trigger logic:

- **`user_notifications` table** (`supabase/migrations/007_user_notifications.sql`): `user_id`, `type` (`event` | `tract_claimed` | `milestone` | `points_adjusted`), `title`, `body`, `campaign_id`/`campaign_slug`, `read`, `created_at`. RLS lets users read/update only their own rows.
- **Two Postgres triggers** insert rows automatically:
  - `on_campaign_event_insert` → notifies every contributor to a campaign when a `campaign_events` row is inserted.
  - `on_territory_claimed` → notifies a user when they claim a territory tract.
- **Backend also inserts rows directly** (raw SQL via FastAPI, not a DB trigger) for problem-report status changes (`problem_reports.py`) and point/spendable-points adjustments (`admin.py`).
- **Client-side inbox** (`NotificationBell.tsx`): loads recent rows, then subscribes to Supabase Realtime `postgres_changes` INSERT events so new notifications appear live while the app is open, with unread badge + mark-as-read.

So "what should trigger a notification" is already answered by every existing insert point above. Push is additive: "also reach the OS notification tray when one of these already fires," not new product logic.

## Decision: where does the push actually get sent from?

Two of the four insert points are pure Postgres triggers with no backend involved (`on_campaign_event_insert`, `on_territory_claimed`); the other two go through FastAPI already. This split matters because sending a push requires an outbound HTTP call (to FCM, and to APNs unless routed through FCM for both platforms — see below), which Postgres can't do on its own.

Options:
1. **Move all four insert points behind FastAPI**, so every `user_notifications` insert already goes through backend code, and a push-send call is just one more step after the insert. Consistent, but means rewriting the two DB triggers as backend logic (or backend polling/consuming them), which is a bigger touch than it sounds for two trigger paths that work fine today.
2. **Keep the DB triggers as-is, add a Supabase Edge Function** invoked via `pg_net`/a `supabase_functions` webhook on `user_notifications` INSERT, and have *that* function send the push (for all four insert points uniformly, since it fires off the table itself regardless of what inserted the row). Single push-sending code path, no changes to existing trigger/backend insert logic. Recommended — least invasive, and the table itself becomes the one true "a notification happened" signal.
3. **Split it**: FastAPI sends the push directly for its two insert points, DB triggers stay unpushed (event/territory-claim notifications just don't get a push). Lowest effort but leaves out what are probably the two most timely/valuable push candidates (a live event announcement, "you claimed a territory") in favor of the two more incidental ones (report status, point adjustments) — not recommended.

Leaning toward option 2 but not committing yet — flagging for your input before scaffolding.

## FCM vs. APNs

Recommend sending **all** platforms through Firebase Cloud Messaging (FCM). FCM can deliver to iOS devices too (it wraps APNs under the hood once you upload your APNs auth key to the Firebase project) — one server-side integration and one API instead of two. This also means:
- No separate APNs-only backend code path.
- Firebase project setup (free tier) has no dependency on the personal-vs-org Apple Developer account decision — that decision only gates the APNs key you upload into Firebase, which is a small side step once resolved, not a rearchitecture.
- Client-side, `@capacitor/push-notifications` already abstracts iOS/Android under one JS API, so this doesn't change the app code either way.

## What's actually missing

1. **Device token storage** — no `device_tokens` (or similar) table exists. Needs: table (`user_id`, `token`, `platform`, `created_at`, maybe `last_seen_at`), a backend endpoint to upsert a token on login/app-open, and cleanup on logout (or just let stale tokens fail silently on send — FCM returns an invalid-token error we could use to prune, but that's a nice-to-have, not launch-blocking).
2. **Client-side plugin wiring** — `@capacitor/push-notifications` isn't installed. Needs a permission-request flow (iOS requires an explicit prompt; Android 13+ also requires runtime permission) and token registration, following the same lazy-import pattern already used in `NativeAppBridge.tsx` for `@capacitor/browser`/`@capacitor/status-bar`.
3. **Firebase project + FCM server key** — doesn't exist yet. Free to create, no blocker.
4. **APNs auth key uploaded into Firebase** — blocked on the personal-vs-org Apple Developer account decision (same blocker already tracked in `capacitor-scoping-2026-08-04.md`). Android/FCM push can ship and be tested independently of this.
5. **The actual push-send integration** (Edge Function or backend call to FCM's HTTP v1 API) — doesn't exist. This is the one piece of genuinely new backend surface area.
6. **Deep-linking from a tapped notification** — tapping a push should take the user to the relevant campaign/event, not just open the app cold. Capacitor's push-notifications plugin exposes a tap-action event; needs wiring into the same `appUrlOpen`-style routing `NativeAppBridge.tsx` already does for the OAuth deep link.

## Work breakdown

1. [x] **Resolve architecture question above**: going with option 2, Supabase Edge Function off `user_notifications` INSERT.
2. [x] **Firebase project setup**: project created (`frontline-498904`), `google-services.json` in place for Android, APNs Authentication Key generated (Apple Developer personal account, Team ID `4PF46V9GR7`) and uploaded to Firebase Cloud Messaging. Admin SDK service account JSON stored as a Supabase secret (dashboard → Edge Functions → Secrets), not committed.
3. [x] **`device_tokens` table + backend upsert endpoint**: `supabase/migrations/061_device_tokens.sql` + `POST /api/device-tokens/register` (`backend/app/api/routes/device_tokens.py`), upserts by token (unique per device, reassigns `user_id` on account switch).
4. [x] **Client plugin wiring**: `@capacitor/push-notifications` installed, `npx cap sync android` pulled in the native plugin, `POST_NOTIFICATIONS` runtime permission added to `AndroidManifest.xml`. Permission request + token registration (calling `POST /api/device-tokens/register` via `frontend/src/lib/pushNotifications.ts`) and tap-to-deep-link handling added to `NativeAppBridge.tsx`, following its existing lazy-import pattern. Registers on initial mount (if already signed in) and on every `SIGNED_IN` auth event.
5. [x] **Push-send integration**: `supabase/functions/send-push/index.ts` — signs a Google service-account JWT, exchanges it for an FCM OAuth2 access token, looks up the notification + all of the user's `device_tokens`, sends one FCM v1 message per device (with `data.url` for deep-linking when `campaign_slug` is set), and prunes tokens FCM reports as `UNREGISTERED`/`NOT_FOUND`. Wired to fire automatically via `supabase/migrations/062_push_notification_webhook.sql` — an `AFTER INSERT` trigger on `user_notifications` that calls `net.http_post` against the function, so all four existing insert points (the two DB triggers plus the two FastAPI direct-inserts) get pushes for free with no changes to their own logic. Verified locally end-to-end (404 for a missing notification, `{"sent":0}` for zero device tokens, and a clean failure at the FCM call since the `FIREBASE_SERVICE_ACCOUNT_JSON` secret only exists in the prod Supabase dashboard, not locally).

   **Setup required outside of migrations** (secrets, same handling as the Firebase Admin SDK JSON — never committed):
   - Local: `ALTER DATABASE postgres SET app.settings.push_function_url = 'http://127.0.0.1:54321/functions/v1/send-push';` and `ALTER DATABASE postgres SET app.settings.service_role_key = '<local service_role key from `supabase status`>';` then reconnect (GUCs set this way apply to new sessions).
   - Prod (not yet done — needs explicit go-ahead given the app is live): `supabase functions deploy send-push --project-ref nvidlxyzyoxzalxbydvg`, then the equivalent `ALTER DATABASE ... SET app.settings.push_function_url = 'https://nvidlxyzyoxzalxbydvg.supabase.co/functions/v1/send-push'` and `app.settings.service_role_key` against the prod DB.
   - **Open question**: the code assumes the Firebase Admin SDK service-account JSON was saved as a Supabase Edge Function secret named `FIREBASE_SERVICE_ACCOUNT_JSON` — confirm this matches the actual name it was given in the dashboard (Edge Functions → Secrets) before deploying to prod, or rename one side to match.
6. [x] **APNs key upload into Firebase**: done 2026-08-07.
7. [ ] **Manual test pass**: Android device receiving a push while app is backgrounded/killed, tap-to-open routing to the right page. Blocked on a real device/build — can't be done from this Windows dev environment; local verification so far is limited to the Edge Function's HTTP behavior (see item 5).
8. [ ] **iOS test pass**: needs the Mac + `ios/` platform to exist first (see `ios-setup-2026-08-06.md`) — this item is blocked on iOS scaffolding, which hasn't started.

## Hard blockers

- ~~**Apple Developer account decision**~~ — resolved 2026-08-07, proceeding on personal accounts. APNs key generated and uploaded to Firebase.
- **`ios/` platform doesn't exist yet** — iOS push testing is blocked on that scaffolding work happening on the Mac first, same as the share sheet and everything else iOS-specific. `GoogleService-Info.plist` is saved at `frontend/pending-ios-assets/` for when that happens.

## Push eligibility per notification type (decided 2026-08-07)

Reviewed all 6 types against one question: is the user already in the app when this fires? Only three types happen independently of the recipient's own foreground session, so only those still send a real push:

- **Push-eligible**: `event` (admin/system-spawned campaign events, e.g. boss events), `points_adjusted` (admin action from outside that user's session), `claim_expired` (background decay / admin pulling a report).
- **Inbox-only, no push**: `tract_claimed` (already `false` since 063), `milestone` and `offer_eligible` (both fire from the same trigger as the user's own real-time action — submitting a contribution/cleanup, or a points change they just caused — so the app is guaranteed open; the in-app `AchievementModal`/bell already covers it, a push would be redundant). `065_milestone_offer_no_push.sql` sets `push_eligible = false` explicitly on all milestone and offer_eligible insert paths (points ladder, per-campaign contribution-count ladder, bag/pound ladders, both offer_eligible insert paths).

## Milestone ladders (reviewed 2026-08-07)

All defined in `063_notification_push_eligible_and_achievements.sql`, all `push_eligible = true` by default (only `tract_claimed`/"leader" notifications are explicitly `push_eligible = false`, inbox-only — deliberate, since leadership can flip often and would be noisy as a push):

1. **Lifetime points** (`profiles.points`, global, not per-campaign): 100 / 500 / 1000 / 2500 / 5000 / 10000. Crossing-range check (`OLD < t AND NEW >= t`), correctly handles admin adjustments moving points down then back up.
2. **Per-campaign cleanup contribution count** (`contributions`, `contribution_type = 'cleanup'`): 5 / 10 / 25 / 50 / 100. Uses exact-equality (`new_count = t`) rather than a crossing-range check — fine for normal one-row-at-a-time submissions, but would silently skip a rung if a count ever jumped by more than 1 in one trigger evaluation (e.g. a bulk backfill/seed inserting several rows in a way that skips the per-row trigger).
3. **Per-campaign cleanup bags** (`cleanups.metrics_small_bags + metrics_large_bags`, summed): 10 / 25 / 50 / 100. Crossing-range check, correctly fires multiple rungs at once if one submission jumps past several.
4. **Per-campaign cleanup pounds** (`cleanups.metrics_pounds`, summed): 100 / 500 / 1000 lbs. Same crossing-range logic as bags.

**Headroom issue found during testing**: testuser hit 302 bags in `trash-war` from test submissions — past every rung of ladder #3 (caps at 100), so no further bag milestone will ever fire for them in that campaign again, while the points ladder (#1) still has four rungs left (500 → 10000) and the contribution-count ladder (#2) caps at 100 same as bags. If real users rack up bag counts or contribution counts this fast, ladders #2 and #3 top out too low relative to #1. Not fixed yet — recommended fix is extending both ladders (e.g. bags → add 250/500/1000; contribution count → add 250/500) to mirror the points ladder's headroom, but holding off until real (non-test) usage data shows whether this actually matters at scale.

## Foreground push display (Android) — not a bug, a gap

Confirmed 2026-08-07 via a real device test (5-cleanup milestone): the webhook chain worked end-to-end — `net._http_response` showed FCM accepted the send (`{"sent":1}`) — but nothing appeared in the Android notification tray. Root cause: `NativeAppBridge.tsx` registers `registration` and `pushNotificationActionPerformed` (tap-to-open) listeners only, no `pushNotificationReceived` listener. FCM's Android SDK auto-displays a tray notification for "notification"-payload messages (which `send-push/index.ts` sends) **only when the app is backgrounded/killed**; in the foreground, Android suppresses the auto-display and hands the payload to app JS instead, which currently does nothing with it. So a push fired while the app is open (as it was here) is delivered successfully but invisible unless you background the app first.

**Not scheduled to fix** — if foreground tray banners are wanted for engagement, it needs a `pushNotificationReceived` listener that manually fires a local notification via `@capacitor/local-notifications` (new dependency, new code path). To verify a push actually reaching the tray today: background the app (don't kill it) or lock the screen, then trigger a milestone.

## Backlog: social milestone pushes (not started)

Today all three milestone triggers (`063_notification_push_eligible_and_achievements.sql`) only notify the user who caused the crossing — nobody else. Idea: notify *other* users when someone hits a milestone, as an engagement/re-open driver ("someone near you just hit 100 points" style). Raised 2026-08-07, deliberately not built yet — needs design decisions before any migration work:

- **Scope**: broadcast to literally everyone, to users active in the same campaign/geo unit, or to some future friends/group relation (doesn't exist yet)?
- **Volume/noise**: the existing per-campaign contribution-count and bag/pound thresholds fire fairly often per active user; fanning all of those out to every other user would be spammy. Likely needs a separate, coarser "broadcast-worthy" threshold tier (e.g. only the top milestone in each ladder — 100 points, 100 bags — not every rung), decoupled from the personal thresholds that already exist.
- **Push vs. inbox-only**: probably want this inbox-eligible broadly but push-eligible only for the rarer "big" tier, to avoid push fatigue — same `push_eligible` column already supports this per-row.
- **Fan-out mechanism**: a per-user milestone insert is one row; a social broadcast is N rows (one per recipient) or a different notification shape entirely (e.g. a feed-style "activity" item that isn't per-recipient at all). Needs its own schema thinking, not a bolt-on to `user_notifications` as-is.

Not scheduled; revisit when there's bandwidth to design it properly rather than backfilling it into the existing trigger functions.

## Explicitly deferred

- Per-notification-type user preferences (mute campaign events but keep territory alerts, etc.) — ship with "on for everything user_notifications already covers," revisit later if users ask.
- Rich push (images, action buttons) — plain title/body is enough to clear the App Store "native functionality" bar; anything richer is a nice-to-have.
- Notification digests / batching (e.g. one push summarizing 5 campaign events instead of 5 pushes) — not needed at current notification volume.
