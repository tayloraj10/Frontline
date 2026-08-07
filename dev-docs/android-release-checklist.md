# Android Release Checklist

Everything needed to get `com.frontline.app` from "runs on an emulator" to "live on the Play Store," and to keep it maintainable release-over-release. Native scaffolding/OAuth/push context lives in `capacitor-scoping-2026-08-04.md`; this doc is the production-release path specifically.

## 1. Firebase API key restriction (do this now, doesn't block anything else)

GitHub flagged `frontend/android/app/google-services.json`'s API key as an exposed secret (2026-08-07). It's a client config key, not a real secret — Google's own guidance is that these ship inside every APK anyway — but it should still be restricted to this app so a scraped key can't be reused elsewhere:

- Google Cloud Console → APIs & Services → Credentials → the Android key for project `frontline-498904`.
- Add an Android app restriction:
  - Package name: `com.frontline.app`
  - SHA-1 (debug keystore, current dev machine): `A7:7A:59:4B:F8:5F:DB:18:63:97:7A:AF:C1:A8:2E:23:A9:33:85:D0`
  - **Add the release keystore's SHA-1 too once it exists (step 2 below)** — otherwise this restriction blocks signed release builds while debug builds keep working, which is a confusing failure mode to hit later.
- Do the same restriction for the iOS key (bundle ID `com.frontline.app`) while in there — see `ios-release-checklist.md`.

## 2. Release keystore (blocks everything below)

Doesn't exist yet. This is the single most consequential file in this whole checklist — **losing it means you can never update the app again under the same package name**; the Play Store has no recovery path for a lost signing key on a non-Play-App-Signing app.

```
keytool -genkey -v -keystore frontline-release.keystore -alias frontline -keyalg RSA -keysize 2048 -validity 10000
```

- Store the `.keystore` file **outside the repo**, in a password manager or encrypted backup — never commit it.
- Record the keystore password, key alias, and key password in the same secure location, not just in your head.
- Recommended: enroll in **Play App Signing** (Google holds the app-signing key, you keep an "upload key" instead) — if the upload key is ever lost, Google can help you reset it; a lost app-signing key on old-style signing cannot be recovered. Play Console offers this during first release setup.
- Get the SHA-1 and SHA-256 fingerprints once generated:
  ```
  keytool -list -v -keystore frontline-release.keystore -alias frontline
  ```

## 3. `assetlinks.json` (Android App Links / OAuth + push tap-to-open)

Currently a placeholder at `frontend/src/app/.well-known/assetlinks.json` — this is why Google OAuth return-to-app and push notification tap-to-open both currently fall back to opening Chrome instead of the app (confirmed 2026-08-07). Fill in the release keystore's **SHA-256** fingerprint from step 2, redeploy the site so `https://www.frontlinemaps.com/.well-known/assetlinks.json` serves the real file, then verify with:
```
npx cap sync android
```
and a fresh install (App Links verification is checked at install time by Android, not live).

## 4. Signed release build

- In `frontend/android/`, configure `app/build.gradle` signing config to point at the release keystore (via a local, gitignored `keystore.properties`, not hardcoded values).
- Build:
  ```
  npx cap sync android
  cd android && ./gradlew bundleRelease
  ```
  produces an `.aab` (Android App Bundle — Play Store's required format, not a raw `.apk`).
- Sanity-test the signed bundle on a real device before uploading (`bundletool` can generate an installable APK set from the `.aab` for this).

## 5. Play Console setup

- Create the app in Play Console under the developer account (currently: personal account — see the legal-entity decision tracked in `capacitor-scoping-2026-08-04.md`; revisit if that changes before this step).
- **Store listing**: title ("Frontline"), short + full description, screenshots (phone required, tablet optional — needs actual device/emulator captures, not mockups), feature graphic (1024×500), app icon (512×512, already have source art per `capacitor-scoping-2026-08-04.md`).
- **Privacy policy URL**: `https://www.frontlinemaps.com/legal/privacy` (`PrivacyContent.tsx`) — confirm it's reachable without auth before submitting.
- **Data safety section**: declare what's collected (location, account email, photos for cleanup submissions) and why — this is a Play Store questionnaire, not a code change, but get it wrong and expect a rejection.
- **Content rating questionnaire**: run it, get the generated rating.
- **Target API level**: Play Store enforces a minimum target `targetSdkVersion` on new submissions — check the current Play requirement against whatever `@capacitor/android` ships with by default before submitting; this shifts yearly.
- **App permissions justification**: location (geolocation/proximity features) and notifications (`POST_NOTIFICATIONS`, already added to `AndroidManifest.xml` per `push-notifications-scoping-2026-08-06.md`) both need a plain-language justification in the listing.

## 6. Rollout

- Upload the `.aab` to **Internal Testing** track first — fast, no review wait, good for a real-device sanity pass before burning a review cycle.
- Then **Closed Testing** (optional) or straight to **Production** with a staged rollout percentage (e.g. start at 20%, watch crash-free rate, ramp up) rather than 100% on day one.
- Play Store review is typically hours, not the multi-day wait iOS review can be — but don't assume same-day.

## 7. Every release after the first

- Version bump: `versionCode` (integer, must strictly increase every submission) and `versionName` (human-readable, e.g. `1.1.0`) in `android/app/build.gradle`.
- Re-run `npx cap sync android` after any Capacitor plugin change.
- Keep the release keystore + Play Console access available to whoever needs to ship the next release — this is a bus-factor risk worth writing down access/location for, not just "I know where it is."

## Open items blocking this checklist right now

- Release keystore doesn't exist (step 2) — blocks steps 3-6 entirely.
- Legal-entity decision (personal vs. LLC/nonprofit Play Console account) — not a hard blocker to start, but changing it later is a real migration, same caveat as in `capacitor-scoping-2026-08-04.md`.
- Store listing assets (screenshots, feature graphic, description copy) not started.
