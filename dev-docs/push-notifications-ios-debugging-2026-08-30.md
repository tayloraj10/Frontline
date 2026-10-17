# Push Notifications Not Working on iOS — Investigation, 2026-08-30

Reported: push notifications aren't showing up on the mobile apps, priority is iOS. This doc captures what was found so we can pick this back up.

## Confirms: hotspots should push

Hotspot spawns aren't special-cased. They ride the same generic pipeline as every other notification type:

`campaign_events` insert (`backend/app/api/routes/events.py`, `_check_report_count_trigger()`) → `on_campaign_event_insert` trigger (`007_user_notifications.sql`) inserts a `user_notifications` row per contributor with `push_eligible = true` → `on_user_notification_insert_push` trigger (`062_push_notification_webhook.sql`) calls the `send-push` Edge Function → FCM → APNs (iOS) / FCM direct (Android).

No hotspot-specific code exists anywhere in this chain, so a hotspot-push failure is a symptom of the shared pipeline being broken, not a hotspot bug.

## Likely culprits, in order of likelihood

1. **Prod pipeline may not be armed at all.** Per `dev-docs/master-backlog.md` (as of the last check), the `send-push` Edge Function may not be deployed, migration `062_push_notification_webhook.sql` may not be applied to prod, and the two Vault secrets (`push_function_url`, `push_service_role_key`) may not be populated on the prod DB. If any of these are missing, the DB trigger silently no-ops, nothing errors, and this would explain a total failure on both platforms. See `dev-docs/push-notifications-prod-deploy-checklist.md` for the exact steps and current status.

2. **No iOS test pass or TestFlight archive has ever been produced.** Per `dev-docs/ios-release-checklist.md`, the Archive → App Store Connect → TestFlight pipeline has never been exercised on iOS, so:
   - `App.entitlements` has `aps-environment: development`. Xcode's Automatic Signing is supposed to rewrite this to `production` at archive time, but that rewrite has never been verified in practice.
   - No confirmed check that the Push Notifications capability is enabled on the App ID (developer.apple.com) and on the distribution provisioning profile. The entitlements key was hand-added rather than via Xcode's "+Capability" flow, so the App ID / profile side isn't guaranteed to match.

3. **iOS-only APNs-to-FCM token exchange can fail silently.** Only iOS does an extra hop: Capacitor core hands back a raw APNs token, which then gets re-exchanged for an FCM token via `@capacitor-community/fcm`'s `FCM.getToken()` (`frontend/src/components/NativeAppBridge.tsx:96-97`). The `registerDeviceToken` call right after is wrapped in `.catch(() => {})` (line 99), so if this exchange or the registration POST fails, there's no error surfaced anywhere and the user just never gets a `device_tokens` row.

4. **Known gap, lower priority: no foreground banner.** No `pushNotificationReceived` listener exists on either platform (`NativeAppBridge.tsx`). A push that arrives while the app is foregrounded is delivered successfully by FCM but never displayed. Documented and confirmed on Android in `dev-docs/push-notifications-scoping-2026-08-06.md`; applies equally to iOS. Wouldn't explain "never works," but could explain "seems inconsistent."

## Suggested diagnosis order

1. Check Supabase dashboard (prod project `nvidlxyzyoxzalxbydvg`): is `send-push` deployed, is migration 062 applied, are both Vault secrets set (`select name from vault.decrypted_secrets;`)?
2. Check the `device_tokens` table for a row belonging to the test user/device. No row means client-side registration is failing silently (culprit 3).
3. If a token exists and the pipeline is armed, trigger a hotspot and check the Edge Function logs — FCM reports back per-device errors (invalid token, wrong `aps-environment`, etc.).

## Status

Not yet started. Revisit and work through the diagnosis order above.
