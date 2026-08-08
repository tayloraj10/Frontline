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

## Common gotcha checklist

1. Did you mean to see prod or your local branch? Check `android/app/src/main/assets/capacitor.config.json` — its `server.url` is the actual source of truth for what the last build will load.
2. Changed `capacitor.config.ts`? You need `npx cap sync <platform>` before it takes effect (`scripts/dev.mjs` does this for you when your LAN IP changes, not on every run).
3. Changed a native asset (icon/splash)? You need a rebuild + reinstall (Run again), not just a WebView refresh.
4. Testing OAuth (Google login)? It opens in the system browser, not the WebView — intentional, not a bug.
5. Something looks stuck/wrong after switching networks or configs and a rebuild doesn't fix it? Try a full uninstall + reinstall (see above) before digging further.
