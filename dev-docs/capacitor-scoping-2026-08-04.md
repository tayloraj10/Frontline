# Capacitor iOS/Android Scoping — 2026-08-04

Scopes dev-plan item #9 (`dev-plan-2026-08-03-mobile-first.md`). Branch: `phase2/capacitor-scoping` (off `phase2-mobile-first`).

## Decision: remote-URL wrapper

Capacitor's native WebView loads the live production site (`https://<prod-domain>`) directly — no static export, no rework of the Next.js server routes (OAuth callback, admin `route.ts` handlers). Goal is fastest path into both stores in the app's current state; the eventual React Native rebuild (item #10) is the point for a from-scratch native/offline architecture, so nothing here should be built in a way that assumes long-term life beyond that rewrite.

Rejected for this pass: static export (item #4-adjacent rework of OAuth/admin routes onto FastAPI) and the hybrid option — both trade a bigger, riskier lift now for offline capability we don't need yet.

## App identity

- App name: **Frontline** (the platform), not "Trash War" — Trash War is just a campaign inside it, so item #4's rename is unrelated/non-blocking for this work.
- Bundle ID / package name: needs a reverse-domain identifier (e.g. `com.frontline.app` or based on actual owned domain) — confirm before scaffolding native projects, since changing it later means a new store listing, not an edit.
- App icon + splash screens: **don't exist yet** (`frontend/public/` only has the default Next.js placeholder SVGs). Need a source icon (1024×1024 min) to generate the full iOS/Android icon and splash set.

## Known technical blocker: Google OAuth in an embedded WebView

`login/page.tsx` uses `supabase.auth.signInWithOAuth({ provider: "google", ... })`. Google's OAuth policy blocks sign-in from embedded/WebView user agents (`disallowed_useragent` error) — this **will** break inside Capacitor's default in-app WebView.

Fix: use the `@capacitor/browser` plugin to open Google's consent screen in the system browser (SFSafariViewController on iOS / Chrome Custom Tabs on Android) instead of the embedded WebView, then catch the redirect back into the app via a deep link (custom URL scheme or Universal Links/App Links) instead of the plain `https://.../auth/callback` redirect, since that lands in the system browser, not the app. Email/password login is unaffected (no embedded-webview restriction there).

This deep-link handling is the one piece of "real" native work required even in the wrapper approach — it's not optional, Google will hard-block the flow without it.

## Minimum native functionality (App Store review)

Guideline 4.2 — Apple has rejected apps that are "just a website in a wrapper." Plan to ship with at least:
- Push notifications (Capacitor Push Notifications plugin + APNs/FCM wiring — new backend surface, doesn't exist today)
- Native share sheet on shareable content (campaign/cleanup event pages)
- The OAuth deep-link handling above already counts as native integration, but shouldn't be the only thing

Push notifications are the biggest net-new backend work in this list — needs its own scoping pass (what triggers a push, device token storage, APNs cert / FCM server key setup) before committing to it as the "native touch."

## Developer accounts

You have personal Apple Developer Program + Google Play Console accounts, but are still deciding whether this needs to be under an LLC/nonprofit instead. Flagging: **moving an app's ownership from a personal account to an org account later is a real migration** (new bundle ID or a formal account-transfer process, re-review, users re-download in some cases) — worth resolving the legal-entity question before the store listing is created, even though it doesn't block the technical scaffolding work below. Not resolving it just means we build against the personal accounts for now and accept possible rework later.

## Work breakdown

1. [x] **Resolve blockers**: bundle ID `com.frontline.app`, prod domain `https://www.frontlinemaps.com` confirmed 2026-08-04. Still open: source app icon asset, legal-entity decision (currently proceeding on personal Apple/Google accounts).
2. [x] **Capacitor install**: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/browser`, `@capacitor/status-bar`, `@capacitor/app` installed. `capacitor.config.ts` points `server.url` at `https://www.frontlinemaps.com`.
3. [~] **Native project scaffolding**: `frontend/android/` generated and committed. `frontend/ios/` **not started** — `npx cap add ios` has never been run, no `ios/` directory exists in the repo on any machine. iOS builds need the Mac laptop (confirmed available) — Xcode/CocoaPods/signing can't happen on Windows. See `ios-setup-2026-08-06.md` for the full step list to run once on the Mac.
4. [~] **Icons/splash**: generated via `@capacitor/assets` from `frontend/src/app/icon-original.png` (copied to `frontend/resources/icon.png`). Full Android adaptive-icon/splash set and PWA icons (matched to the existing `public/manifest.webmanifest`, which was untracked until this commit) are in place. iOS AppIcon/Splash assets **not generated yet** — blocked on `ios/` existing at all (item 3); rerun `npx cap assets generate` once the ios platform is added.
5. [~] **OAuth deep link**: done — `login/page.tsx` opens Google's consent screen via `@capacitor/browser` on native instead of the embedded WebView; `NativeAppBridge.tsx` catches the redirect back via `appUrlOpen` and hands it to the main WebView. Android intent-filter added (`AndroidManifest.xml`). `apple-app-site-association` now has the real Apple Team ID (`4PF46V9GR7`, resolved 2026-08-07 — proceeding on personal developer accounts) — Universal Links should verify once this deploys. `assetlinks.json` is still a placeholder: needs the Android release keystore's SHA-256 fingerprint, and the keystore doesn't exist yet. Until that's filled in, Google login still works but leaves Android users in the system browser after completing instead of auto-returning to the app.
6. [~] **Push notifications**: Firebase/FCM setup done (project created, `google-services.json` in place, APNs Authentication Key generated and uploaded to Firebase Cloud Messaging). See `push-notifications-scoping-2026-08-06.md` for the remaining work: device token storage, the push-send integration itself, and client-side plugin wiring.
7. [x] **Native share sheet**: done. `@capacitor/share` wired via `frontend/src/lib/share.ts` (native → Web Share API → clipboard fallback) and a reusable `ShareButton` component, on both the campaign map header (icon-button variant, matching the info/help buttons) and the cleanup event page (text-button variant).
8. [~] **Safe-area / status bar handling**: `NativeAppBridge.tsx` sets `StatusBar` style/overlay on native launch. Broader mobile-first layout pass (item #8 in the main dev plan) still separate, not started here.
9. [ ] **Store listings**: screenshots (device-size-specific), description copy, privacy policy URL (check `PrivacyContent.tsx` is reachable at a stable public URL), age rating questionnaire, permissions justification (location, notifications).
10. [ ] **Build + submit**: TestFlight (iOS, needs the Mac) and Internal Testing track (Android) first, then store review submission.

## Remaining hard blockers before a real device/store build

- ~~**App icon**~~ — done, generated 2026-08-04 from `icon-original.png`.
- **Android release keystore** — needed both for signing and to fill in `assetlinks.json`'s SHA-256 fingerprint.
- ~~**Apple Team ID**~~ — resolved 2026-08-07, proceeding on personal developer accounts. Team ID `4PF46V9GR7` now in `apple-app-site-association`.

## What the account decision (personal vs. LLC/nonprofit) actually blocks

Not resolving this yet does **not** block:
- Running the app locally in the Android emulator or on a physical Android device via USB (`npx cap open android`).
- Running the app in the iOS Simulator on the Mac laptop (`npx cap open ios`) — the simulator doesn't need a paid developer account at all.
- Testing the OAuth system-browser handoff, status bar, and general remote-URL wrapper behavior.
- Push notification scoping, share sheet work, or any other work-breakdown item that isn't the store submission itself.

It does block:
- Running on a **physical iOS device** (not simulator) — that needs a paid Apple Developer Program membership + provisioning profile tied to a specific Team ID.
- ~~Universal/App Links actually verifying~~ — resolved 2026-08-07, real Team ID now in `apple-app-site-association`. Android's equivalent (`assetlinks.json`) still needs the release keystore fingerprint.
- Final code-signed release builds and store submission (TestFlight, Play Console Internal Testing, and beyond).

So this week's work (icons ✅, native scaffolding, OAuth fix, push notifications scoping, testing in emulator/simulator) can all proceed without it. It only becomes a hard blocker once we're ready to sign a release build or put the app on a physical iOS device.

## Explicitly deferred (belongs to the React Native rewrite, item #10, not this pass)

- Offline support / static bundling
- Any deeper native-feel UI work beyond the minimum-functionality bar above
- Biometric login, native camera integration, or other device-native features beyond what's listed
