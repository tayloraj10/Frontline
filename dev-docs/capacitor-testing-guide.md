# Capacitor App — Running & Testing Guide

Reference companion to `capacitor-scoping-2026-08-04.md` (architecture/decisions). This doc is just the "how do I actually run this" cheat sheet.

## Quick facts

- The app is a **remote-URL wrapper**: the native WebView loads a URL over the network at runtime. It does not bundle your web code into the APK/IPA.
- Whatever `capacitor.config.ts` says `server.url` is gets baked into the native project when you run `npx cap sync`. Changing `capacitor.config.ts` alone does **nothing** to an already-built app — you must re-sync and rebuild.
- Default (no env var set) points at production: `https://www.frontlinemaps.com`.

## Running against production (default)

```
cd frontend
npx cap sync android   # or ios
npx cap open android   # or ios
```
Then hit Run in Android Studio / Xcode. This shows whatever is actually live on frontlinemaps.com right now — **not** your local branch, even if you have uncommitted or unmerged work.

## Running against your local branch instead

The Android emulator can't reach your machine via `localhost` — `localhost` inside the emulator means the emulator itself. Use `10.0.2.2`, the emulator's special alias for the host machine's `localhost`. A physical device needs your machine's actual LAN IP instead (e.g. `192.168.1.23`) since `10.0.2.2` only works inside the emulator.

```
cd frontend
npm run dev                                          # in one terminal, leave it running
CAP_DEV_SERVER=http://10.0.2.2:3000 npx cap sync android   # in another terminal
npx cap open android
```
Then Run in Android Studio. This also auto-enables cleartext (plain http) for that build, since `next dev` isn't https — production builds stay https-only.

**To switch back to prod:** just re-run `npx cap sync android` with no `CAP_DEV_SERVER` set.

**Physical device instead of emulator:** replace `10.0.2.2` with your machine's LAN IP, e.g. `CAP_DEV_SERVER=http://192.168.1.23:3000`. Both devices need to be on the same network.

## Testing native-only changes (icon, splash, status bar)

These are baked into the native project as actual asset files (`android/app/src/main/res/...`, `ios/App/App/Assets.xcassets/...`) — regenerating them or syncing does **not** hot-reload. You have to reinstall the app:

- Just hit the green ▶ Run button again in Android Studio/Xcode — it rebuilds and reinstalls, and the new splash/icon shows on the next cold launch.
- If it still looks stale after that, `Build > Clean Project` then Run again clears any Gradle cache weirdness.
- `Build > Clean Project` alone does **not** re-sync `capacitor.config.ts` changes (see above) — that always needs `npx cap sync`.

## Common gotcha checklist when something looks "stale" or "wrong"

1. Did you mean to see prod or your local branch? Check `android/app/src/main/assets/capacitor.config.json` — its `server.url` is the actual source of truth for what the last build will load.
2. Changed `capacitor.config.ts`? You need `npx cap sync <platform>` before it takes effect.
3. Changed a native asset (icon/splash)? You need a rebuild + reinstall (Run again), not just a WebView refresh.
4. Testing OAuth (Google login)? It opens in the system browser, not the WebView — this is intentional (see scoping doc), not a bug.
