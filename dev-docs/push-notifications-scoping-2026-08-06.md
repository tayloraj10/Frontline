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

1. [ ] **Resolve architecture question above** (Edge Function vs. backend-owned inserts) before scaffolding anything.
2. [ ] **Firebase project setup**: create project, enable FCM, get server key / service account credentials.
3. [ ] **`device_tokens` table + backend upsert endpoint**: migration + a small FastAPI route, called from the client on login and app-foreground.
4. [ ] **Client plugin wiring**: install `@capacitor/push-notifications`, permission request + token registration in `NativeAppBridge.tsx` (or a new sibling module, TBD), tap-to-deep-link handling.
5. [ ] **Push-send integration**: whichever path is chosen above, wire the actual FCM HTTP v1 call for the two DB-trigger notification types and (if choosing option 1 or 3) the two backend-direct-insert types.
6. [ ] **APNs key upload into Firebase**: blocked on Apple Developer account decision; Android can ship without this.
7. [ ] **Manual test pass**: Android device receiving a push while app is backgrounded/killed, tap-to-open routing to the right page.
8. [ ] **iOS test pass**: needs the Mac + `ios/` platform to exist first (see `ios-setup-2026-08-06.md`) — this item is blocked on iOS scaffolding, which hasn't started.

## Hard blockers

- **Apple Developer account decision** (personal vs. LLC/nonprofit) — same blocker as OAuth's `apple-app-site-association`, now also blocks APNs-via-Firebase. Android/FCM push is fully unblocked and can ship independently.
- **`ios/` platform doesn't exist yet** — iOS push testing is blocked on that scaffolding work happening on the Mac first, same as the share sheet and everything else iOS-specific.

## Explicitly deferred

- Per-notification-type user preferences (mute campaign events but keep territory alerts, etc.) — ship with "on for everything user_notifications already covers," revisit later if users ask.
- Rich push (images, action buttons) — plain title/body is enough to clear the App Store "native functionality" bar; anything richer is a nice-to-have.
- Notification digests / batching (e.g. one push summarizing 5 campaign events instead of 5 pushes) — not needed at current notification volume.
