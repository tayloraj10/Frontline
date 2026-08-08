# iOS Release Checklist

Everything needed to get `com.frontline.app` from "runs in the Simulator" to "live on the App Store." `ios-setup-2026-08-06.md` covers the greenfield `npx cap add ios` scaffolding steps (Mac-only, not yet done); this doc picks up from there through store submission and repeat releases. Native scaffolding/OAuth/push context lives in `capacitor-scoping-2026-08-04.md`.

**Everything here needs the Mac laptop.** None of it can be done from Windows.

## 1. Firebase API key restriction (do this now, doesn't block anything else)

GitHub flagged `frontend/pending-ios-assets/GoogleService-Info.plist`'s API key as an exposed secret (2026-08-07). Same as the Android key — client config, not a real secret, but restrict it anyway:

- Google Cloud Console → APIs & Services → Credentials → the iOS key for project `frontline-498904`.
- Add an iOS app restriction: Bundle ID `com.frontline.app`.
- (The Android key restriction is covered in `android-release-checklist.md`, same Cloud Console visit.)

## 2. Prerequisites (from `ios-setup-2026-08-06.md`)

- `npx cap add ios` run at least once — **not done yet**, no `frontend/ios/` directory exists. Do this first; everything below assumes `ios/` exists.
- Xcode + CocoaPods installed.
- Icons/splash regenerated for iOS via `@capacitor/assets` (Android's are already done, iOS needs its own pass once `ios/` exists).

## 3. Apple Developer Program enrollment

- $99/year, required for device testing beyond the Simulator, TestFlight, and App Store submission.
- Currently proceeding on the **personal** Apple Developer account (Team ID `4PF46V9GR7`, resolved 2026-08-07) — see the legal-entity caveat in `capacitor-scoping-2026-08-04.md` about how much rework moving to an org account later would be.
- Not needed just to test the WebView wrapper in the Simulator — only becomes a hard blocker at physical-device testing / TestFlight / submission.

## 4. Signing

- In Xcode: select the Apple Developer team, let Xcode manage the provisioning profile (automatic signing) unless there's a specific reason to hand-manage profiles.
- Bundle ID must match Android's `appId` in `capacitor.config.ts`: `com.frontline.app`.
- Distribution certificate + provisioning profile get created automatically by Xcode's managed signing the first time you archive for a real device/TestFlight.

## 5. Associated Domains / Universal Links (OAuth + push tap-to-open)

- Add the Associated Domains capability in Xcode: `applinks:www.frontlinemaps.com`.
- `apple-app-site-association` at `frontend/src/app/.well-known/apple-app-site-association` already has the real Team ID (`4PF46V9GR7`) and should be live at `https://www.frontlinemaps.com/.well-known/apple-app-site-association` — confirm it's actually serving from prod before relying on it, since this is what makes the Google OAuth system-browser handoff and push tap-to-open return to the app instead of Safari.
- Universal Links verification happens at install time, same caveat as Android App Links — test with a fresh install, not a hot reload.

## 6. Required Info.plist entries

- `NSLocationWhenInUseUsageDescription` — required even though there's no native Capacitor Geolocation plugin, because iOS WebKit still needs the usage string for browser-based geolocation. Text already drafted in `ios-setup-2026-08-06.md`: *"Frontline uses your location to show nearby campaigns and territory."*
- Push notification entitlement (`aps-environment`) — added automatically by Xcode when the Push Notifications capability is enabled; needed for `@capacitor/push-notifications` / APNs (already wired per `push-notifications-scoping-2026-08-06.md`, APNs key uploaded to Firebase 2026-08-07).
- **Apple's privacy "nutrition label" manifest** (`NSPrivacyAccessedAPITypes` in `PrivacyInfo.xcprivacy`) — required as of Apple's current App Store submission rules if the app (or any bundled SDK, including Capacitor plugins and the Firebase/FCM SDK) touches "required reason" API categories like UserDefaults or disk space APIs. Check each installed Capacitor plugin + the Firebase iOS SDK for whether they ship their own privacy manifest already (most modern ones do) versus needing one declared at the app level. This has caused real App Store rejections since Apple started enforcing it — don't skip it.

## 7. Build + TestFlight

```
cd frontend
npx cap sync ios
npx cap open ios
```
- Archive (Product → Archive) in Xcode, upload to App Store Connect.
- TestFlight: internal testing (up to 100 testers, no review) before external testing (requires a lightweight Beta App Review) or straight to submission.

## 8. App Store Connect listing

- Create the app record, bundle ID `com.frontline.app`.
- **Screenshots**: required per device size class Apple currently mandates (at minimum the largest iPhone size; 6.5"/6.7" classes have historically been required, confirm current requirement at submission time since Apple's required-size list changes). No tablet screenshots needed unless targeting iPad as a supported device.
- **App description, keywords, support URL, marketing URL** (optional).
- **Privacy policy URL**: `https://www.frontlinemaps.com/legal/privacy` (same page as Android).
- **App Privacy questionnaire** (data collection disclosure, separate from the `.xcprivacy` manifest in step 6) — declare location, account/email, and photo data collection and purpose.
- **Age rating questionnaire.**
- **Export compliance**: standard HTTPS/TLS usage typically qualifies for the "uses only standard encryption exemption" — confirm this is still accurate at submission time, since this affects whether an annual self-classification report is owed to the U.S. government.

## 9. Submission + review

- Submit for review after TestFlight testing looks clean.
- Apple's review is typically 24-48 hours but can run longer, and **first submissions get more scrutiny** than updates — budget more buffer than Android's review time.
- Guideline 4.2 ("just a website in a wrapper") is the specific rejection risk already flagged in `capacitor-scoping-2026-08-04.md` — push notifications, native share sheet, and the OAuth deep-link handling are the mitigations already built; nothing further needed here unless review pushes back.

## 10. Every release after the first

- Version bump: `CFBundleShortVersionString` (marketing version, e.g. `1.1.0`) and `CFBundleVersion` (build number, must strictly increase per submission to App Store Connect, even across the same marketing version) in Xcode's target settings.
- Re-run `npx cap sync ios` after any Capacitor plugin change.
- Re-archive and re-upload through the same TestFlight → submit flow each time; there's no separate "patch" fast path.

## Open items blocking this checklist right now

- `frontend/ios/` platform doesn't exist — nothing past step 2 can happen until `npx cap add ios` runs on the Mac (`ios-setup-2026-08-06.md`).
- iOS AppIcon/Splash assets not generated yet (blocked on the same thing).
- Store listing assets (screenshots, description copy) not started.
- Privacy nutrition label manifest (step 6) not yet audited against installed plugins.
