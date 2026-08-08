# iOS Release Checklist

Everything needed to get `com.frontlinemaps.app` from "runs in the Simulator" to "live on the App Store." `ios-setup-2026-08-06.md` covers the greenfield `npx cap add ios` scaffolding steps (Mac-only, done as of `phase2/ios-setup`); this doc picks up from there through store submission and repeat releases. Native scaffolding/OAuth/push context lives in `capacitor-scoping-2026-08-04.md`.

Note: iOS's bundle ID (`com.frontlinemaps.app`, per `capacitor.config.ts`'s `appId` and `project.pbxproj`) intentionally differs from Android's `applicationId` (`com.frontline.app`, per `android/app/build.gradle`) — they don't need to match, each platform's `.well-known` route declares its own correct value.

**Everything here needs the Mac laptop.** None of it can be done from Windows.

## 1. Firebase API key restriction (do this now, doesn't block anything else)

GitHub flagged `frontend/pending-ios-assets/GoogleService-Info.plist`'s API key as an exposed secret (2026-08-07). Same as the Android key — client config, not a real secret, but restrict it anyway:

- Google Cloud Console → APIs & Services → Credentials → the iOS key for project `frontline-498904`.
- Add an iOS app restriction: Bundle ID `com.frontlinemaps.app`.
- (The Android key restriction is covered in `android-release-checklist.md`, same Cloud Console visit.)

## 2. Prerequisites (from `ios-setup-2026-08-06.md`)

- `npx cap add ios` run — **done**, `frontend/ios/` exists (`phase2/ios-setup`).
- Xcode + CocoaPods installed.
- Icons/splash regenerated for iOS via `@capacitor/assets` — confirm current status, not re-verified as part of this pass.

## 3. Apple Developer Program enrollment

- $99/year, required for device testing beyond the Simulator, TestFlight, and App Store submission.
- Currently proceeding on the **personal** Apple Developer account (Team ID `4PF46V9GR7`, resolved 2026-08-07) — see the legal-entity caveat in `capacitor-scoping-2026-08-04.md` about how much rework moving to an org account later would be.
- Not needed just to test the WebView wrapper in the Simulator — only becomes a hard blocker at physical-device testing / TestFlight / submission.

## 4. Signing

- Already set: `CODE_SIGN_STYLE = Automatic`, `DEVELOPMENT_TEAM = 4PF46V9GR7` for both Debug and Release configs — Xcode manages the provisioning profile.
- `App.entitlements`'s `aps-environment` currently reads `development` in the source file — this is expected and not something to hand-edit; Automatic Signing rewrites it to `production` in the actual signed binary at archive time, based on the distribution profile used. Confirm visually in Xcode's Organizer after producing the first real archive.
- Distribution certificate + provisioning profile get created automatically by Xcode's managed signing the first time you archive for a real device/TestFlight.

## 5. Associated Domains / Universal Links (OAuth + push tap-to-open)

- Already set: Associated Domains capability with `applinks:www.frontlinemaps.com` in `App.entitlements`.
- `apple-app-site-association` at `frontend/src/app/.well-known/apple-app-site-association` has the real Team ID (`4PF46V9GR7`) and correct bundle ID.
- **Was broken, now fixed (2026-08-08, not yet deployed):** the route was being served correctly by Next.js, but the auth proxy (`src/proxy.ts`) redirected unauthenticated requests — including Apple's and Google's unauthenticated verification fetches — to `/login` with a 307, since `.well-known/*` wasn't excluded from the middleware matcher. Same bug affected Android's `assetlinks.json`, and is the actual root cause of OAuth/push tap-to-open falling back to a browser instead of reopening the app on both platforms. Fixed in `src/proxy.ts`'s matcher on `phase2/ios-setup`. **Must be deployed to production before verification/testing will work** — confirm with `curl -i https://www.frontlinemaps.com/.well-known/apple-app-site-association` returns `200 application/json` with no redirect, post-deploy.
- Universal Links verification happens at install time, same caveat as Android App Links — test with a fresh install, not a hot reload, and only after the fix above is live.

## 6. Required Info.plist entries

- `NSLocationWhenInUseUsageDescription` — required even though there's no native Capacitor Geolocation plugin, because iOS WebKit still needs the usage string for browser-based geolocation. Text already drafted in `ios-setup-2026-08-06.md`: *"Frontline uses your location to show nearby campaigns and territory."*
- Push notification entitlement (`aps-environment`) — added automatically by Xcode when the Push Notifications capability is enabled; needed for `@capacitor/push-notifications` / APNs (already wired per `push-notifications-scoping-2026-08-06.md`, APNs key uploaded to Firebase 2026-08-07).
- **Apple's privacy "nutrition label" manifest** (`NSPrivacyAccessedAPITypes` in `PrivacyInfo.xcprivacy`) — **checked 2026-08-08, no action needed.** None of the installed `@capacitor/*` plugins ship their own manifest, but Firebase, GoogleUtilities, Cordova, Capacitor's own core framework, and `ion-ios-camera` all ship theirs bundled inside their SPM-resolved frameworks/resource bundles (confirmed present in `DerivedData/.../SourcePackages`), which get pulled into the app binary automatically at archive time. The app's own custom Swift (`AppDelegate.swift`, `SceneDelegate.swift`) doesn't touch any required-reason API directly, so no app-level manifest is needed either. Re-check this if new native SDKs/plugins are added later.

## 7. Build + TestFlight

```
cd frontend
npm run sync:ios-version   # syncs MARKETING_VERSION/CURRENT_PROJECT_VERSION from package.json
npx cap sync ios
npx cap open ios
```
- Archive (Product → Archive) in Xcode, upload to App Store Connect.
- TestFlight: internal testing (up to 100 testers, no review) before external testing (requires a lightweight Beta App Review) or straight to submission.

## 8. App Store Connect listing

- Create the app record, bundle ID `com.frontlinemaps.app`.
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

- Version bump: bump `frontend/package.json`'s `version`, then run `npm run sync:ios-version` — it sets `MARKETING_VERSION` from `package.json` (mirroring how `npm run build:android` derives Android's `versionName`) but `CURRENT_PROJECT_VERSION` (build number) is a separate auto-incrementing counter, not derived from the semver — it just reads whatever's currently in `project.pbxproj` and adds 1. This is intentional: Apple requires each upload's build number to strictly increase across *all* marketing versions, so deriving it from semver caused collisions on same-version rebuilds. Run this every time you're about to archive, even without a version bump.
- Re-run `npx cap sync ios` after any Capacitor plugin change.
- Re-archive and re-upload through the same TestFlight → submit flow each time; there's no separate "patch" fast path.

## Open items blocking this checklist right now

(Last audited 2026-08-08 against the real `ios/` project state — most of this list was previously stale, written before `npx cap add ios` had run.)

- **`.well-known` auth-redirect fix (step 5) needs to be deployed to production** — fixed locally on `phase2/ios-setup`, not live yet. Universal Links can't be verified until it ships.
- Store listing assets (screenshots, description copy, keywords, support/marketing URLs) not started.
- App Privacy questionnaire, age rating, and export compliance declarations not started (step 8) — these are App Store Connect form-fills, not code.
- No archive/TestFlight build has ever been produced — the Archive → App Store Connect pipe (step 7) is entirely untested.
- Two known app bugs (login issue, viewport zoom-stuck issue) previously blocked testing — fixed as of 2026-08-07/08, not tracked in this doc's history but confirmed resolved.
