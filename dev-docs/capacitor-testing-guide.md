# Capacitor App — Running & Testing Guide

Reference companion to `capacitor-scoping-2026-08-04.md` (architecture/decisions). This doc is just the "how do I actually run this" cheat sheet.

## Quick facts

- The app is a **remote-URL wrapper**: the native WebView loads a URL over the network at runtime. It does not bundle your web code into the APK/IPA.
- Default (no local dev server running) points at production: `https://www.frontlinemaps.com`.
- `frontend/scripts/dev.mjs` (run via `npm run dev`, e.g. the "Frontend: Next.js" launch config) auto-detects your machine's LAN IP and handles everything below for you — for local dev you usually don't need to think about any of it.

## Running against production (default)

```
cd frontend
npx cap sync android   # or ios
npx cap open android   # or ios
```
Then hit Run in Android Studio / Xcode. Shows whatever is live on frontlinemaps.com right now, not your local branch.

## Running against your local branch

Just start the "Full Stack" launch config (or `npm run dev` in `frontend/`) like normal — no env vars to set by hand. `scripts/dev.mjs`:

- Detects your LAN IP and points `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_FASTAPI_URL`, and `CAP_DEV_SERVER` at it, for both the browser and the emulator/a physical device.
- Re-syncs the Android project (`npx cap sync android`) automatically, but only when your LAN IP has actually changed since last run.
- Clears `frontend/.next` automatically when the IP changes, so you never hit stale-cached env values.

Then:
```
cd frontend
npx cap open android
```
and hit Run in Android Studio. Browser testing (`http://localhost:3000`) and emulator/device testing both work from this same running process — no separate config needed.

**Physical device:** same flow, no changes needed — it already uses your LAN IP, and a device on the same network can reach it exactly like the emulator can.

**FastAPI CORS:** the backend allows any private LAN IP on port 3000 in development (see `backend/app/core/config.py`'s `cors_origin_regex`), so this isn't something you need to configure either.

**Google OAuth over a LAN IP:** Supabase's redirect allow-list (`supabase/config.toml`) only matches exact URLs, so OAuth-return testing against a LAN IP may need that file updated manually if you hit it — known limitation, not automated.

## Testing native-only changes (icon, splash, status bar)

These are baked into the native project as actual asset files (`android/app/src/main/res/...`, `ios/App/App/Assets.xcassets/...`) — regenerating them or syncing does **not** hot-reload. You have to reinstall the app:

- Hit Run again in Android Studio/Xcode — rebuilds and reinstalls, new splash/icon shows on next cold launch.
- If it still looks stale, `Build > Clean Project` then Run again.
- If the app itself looks broken/stuck after a native or config change (black screen, frozen UI) and a clean rebuild doesn't fix it, fully **uninstall the app from the emulator/device first**, then Run again — a rebuild alone doesn't clear stale installed app/WebView state.

## Browser APIs that behave differently in the native WebView

Found via the camera bug (2026-08-08) — `getUserMedia`-based camera capture silently failed in Capacitor's WKWebView and needed the real `@capacitor/camera` plugin instead. Other browser APIs the app uses that are worth verifying on-device rather than assuming they behave like a real browser, in priority order:

- **`target="_blank"` links to arbitrary external sites** (partner website/social links in `PartnerDetailClient.tsx`, business "Visit website" popup in `CampaignMap.tsx`) — not routed through `@capacitor/browser`'s `Browser.open` the way the OAuth flow (`app/login/page.tsx`, `NativeAppBridge.tsx`) already is. "Get directions" links happen to work today (confirmed 2026-08-08) but only because `google.com/maps` is a registered iOS universal link that iOS intercepts regardless of `target="_blank"` — that's not proof the other external links work, since they don't get that handoff. Test: tap a partner's website/social link, or "Visit website" from a business map pin.
  - Side note: if Google Maps isn't installed, the universal link falls through to the Google Maps *website*, not Apple Maps — there's no Apple Maps fallback today. Would need explicit code (e.g. `maps://`/`maps.apple.com` fallback) if that's wanted.
- **`navigator.clipboard.writeText()` copy buttons** (redemption code copy in `RedemptionConfirmationModal.tsx`, support email copy in `SupportButton.tsx`, admin partner-apply URL copy in `AdminPanel.tsx`) — no `@capacitor/clipboard` dependency exists as a fallback. Modern WKWebView likely supports this from a user gesture, but unverified. Note: manually selecting text and copying is the OS's native text selection and always works — it's not the same code path as these buttons, so it doesn't confirm this one way or the other. Test: redeem a partner offer and use its "copy code" button, or the support button's "copy email."

## Getting logs off a real device (TestFlight/App Store Connect build)

Needed this 2026-08-09 chasing a bug where the cleanup modal's "Take Photo"/"Choose from
Gallery" buttons appeared to do nothing on a real iPhone running a TestFlight build (see
"Cleanup modal photo silently failing to attach" below for the actual bug). Two different
tools depending on what kind of log you need:

- **Xcode Devices/Console** (native/Swift-level logs, crashes): plug the iPhone into a
  Mac, Xcode → Window → Devices and Simulators → select the phone → "Open Console" (or
  just build+run onto the device from Xcode and watch its console pane). This does
  **not** show `console.log`/`console.error` calls from the app's JS — those run inside
  the WKWebView's own JS context, invisible to the native log stream.
- **Safari Web Inspector** (JS console/network — what you want for anything logged from
  React/TS code): on the iPhone, Settings → Safari → Advanced → enable **Web Inspector**.
  Plug the phone into a Mac, then on the Mac enable Safari's Develop menu (Safari →
  Settings → Advanced → "Show Develop menu in menu bar") if it's not already there. Open
  Safari → Develop → (phone's name) → the Frontline app's WebView shows up as an
  inspectable target even though it's a native app, not a browser tab, because Capacitor
  apps are just a WKWebView under the hood. Opens a normal DevTools window live-attached
  to the running app — reproduce the bug and watch the console/network tabs.
- A build has to actually contain the logging you want to see before either of these is
  useful — a TestFlight build predates any code changes you've made locally until you
  bump the build number and re-upload.

## Cleanup modal photo silently failing to attach (found 2026-08-09)

Reported: on a real iPhone testing a TestFlight build, tapping "Take Photo" or "Choose
from Gallery" in the cleanup contribution modal would run the native picker to
completion but the photo never appeared in the modal — no error, no thumbnail, nothing.

Root cause found in `PhotoCaptureInput` in
`frontend/src/components/contributions/ContributionPanel.tsx`: `handleTakePhoto` and
`handleChooseFromGallery` wrapped both the native `Camera.takePhoto()`/
`chooseFromGallery()` call *and* the follow-up `mediaResultToFile()` conversion (which
`fetch()`s the plugin's returned `webPath` back into a `Blob`) in a single `catch {}`
that assumed every failure meant "user cancelled the picker." A real failure partway
through — e.g. the `fetch()` of the webPath — was swallowed identically to a genuine
cancel, so nothing showed up and nothing was logged.

Fixed by only treating Capacitor's actual cancellation rejection ("User cancelled photos
app" — confirmed in `@capacitor/camera`'s iOS/Android source as the literal message used
for both platforms) as silent; any other error now logs via `console.error` and shows a
small inline "Couldn't add that photo — please try again." message under the buttons.

**Still open:** what's actually throwing on the real device hasn't been confirmed yet —
this fix makes the failure visible instead of fixing an unconfirmed root cause. Leading
hypothesis going in: this app runs as a **remote-URL wrapper** (WebView loaded from
`https://www.frontlinemaps.com`, not a bundled local page — see "Quick facts" above),
so the plugin's `webPath` for a captured photo is served from a different scheme
(`capacitor://localhost/...`) than the page's own origin, which needs the CORS-header
allowance in `WKURLSchemeHandler` (Capacitor's `isUsingLiveReload` check) to make the
cross-scheme `fetch()` succeed at all. That check is theoretically satisfied here
(`server.url`'s scheme "https" differs from the local resource's "capacitor" scheme, so
Capacitor's asset handler does add `Access-Control-Allow-Origin`), so this may turn out
to be a red herring — but it's the first thing to rule in/out once real device console
logs are in hand. Next step: reproduce on a build containing this fix, read the actual
error via Safari Web Inspector (see above), and update this note with what it says.

## Common gotcha checklist

1. Did you mean to see prod or your local branch? Check `android/app/src/main/assets/capacitor.config.json` — its `server.url` is the actual source of truth for what the last build will load.
2. Changed `capacitor.config.ts`? You need `npx cap sync <platform>` before it takes effect (`scripts/dev.mjs` does this for you when your LAN IP changes, not on every run).
3. Changed a native asset (icon/splash)? You need a rebuild + reinstall (Run again), not just a WebView refresh.
4. Testing OAuth (Google login)? It opens in the system browser, not the WebView — intentional, not a bug.
5. Something looks stuck/wrong after switching networks or configs and a rebuild doesn't fix it? Try a full uninstall + reinstall (see above) before digging further.
