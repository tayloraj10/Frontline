# Native app (Capacitor) load time and general page speed (2026-10-18)

Status: **scoped, not started**. Nothing below is implemented, and nothing has been measured yet. Everything here comes from reading the code, so step 1 (measure) comes before any fix.

Related: `capacitor-scoping-2026-08-04.md` (why the app is a remote-URL wrapper), `capacitor-testing-guide.md`, `database-performance-and-materialized-views-scoping-2026-10-18.md` (backend query side). Branches `loading-improvements` (remote only, skeletons and nav spinner) and `caching-improvements` (scrapped, kept) may hold reusable work, review them before starting.

## 1. How the app loads today

The app is a remote-URL wrapper: `capacitor.config.ts` sets `server.url` to `https://www.frontlinemaps.com`, and `frontend/www/index.html` is an empty placeholder. Every cold launch:

1. Native shell starts, splash shows (`launchAutoHide: false`).
2. WebView fetches server-rendered HTML from Vercel. This runs the root layout, then the page.
3. JS, CSS and font bundles download. There is no service worker and `public/` has only a manifest, so nothing is precached by us.
4. Page hydrates. `NativeAppBridge` then loads about 10 Capacitor plugin imports, runs the geolocation polyfill and registers push.
5. Splash hides, but not before `MIN_SPLASH_MS` (1500ms) since launch. An 8s safety timeout force-hides it if hydration never happens.
6. For signed-in users, `/` renders `HomeAutoRedirect`, which sends them to `/campaigns/trash-war` (or `/partners/dashboard`). That is a second full server render.

## 2. Suspected causes (unconfirmed)

1. **Blocking work in the root layout, on every navigation.** `AppHeader` and `LegalGate` both run in `layout.tsx`.
   - `supabase.auth.getUser()` is a network round trip to Supabase Auth. It is called in the proxy middleware, in `AppHeader`, in `LegalGate`, and again in most pages: 3 to 4 per request.
   - `AppHeader` then runs a `profiles` query and a `partner_business_admins` query, then an uncached FastAPI call (`has-pending-organizer-items`, `cache: "no-store"`, 2s timeout) before any HTML can stream. `LegalGate` runs its own `profiles` query.
   - On a phone with weak signal each sequential hop costs far more than on desktop.
2. **Double page load on launch** for signed-in users (item 6 above).
3. **Splash floor of 1.5s.** The app can never feel faster than this, even when the page is ready earlier. A product choice, not a bug.
4. **Campaign page waterfall.** `campaigns/[slug]/page.tsx` awaits `cleanup-events`, then `problem-reports`, then membership/profile/my-contributions, then profiles/groups, in sequence after the cached block. Most of those are independent. The cached block also pulls every `cleanups` row and every `territory_claims` row for the campaign (see the database doc).
5. **Heavy client bundle on the map route.** 143 `"use client"` files, `CampaignPageClient.tsx` is 1,683 lines, plus `ContributionPanel`, `GeoStatsExplorer`, `StatDetailModal`. MapLibre is already dynamically imported. Actual shipped size is unknown.
6. **Images.** 75 raw `<img>` tags and zero `next/image` usages. The `images` block in `next.config.ts` (avif/webp, remote patterns) only applies to `next/image`, so it does nothing today. Avatars and event photos load at full size.
7. **No repeat-launch caching.** No service worker, so returning launches depend on the WebView HTTP cache, which the OS can evict.
8. **Non-critical native init on the critical path.** Push registration, geolocation polyfill and the notification primer run during startup. They should not delay first paint.
9. **Backend JSON endpoints send no `Cache-Control`.** Tiles are cached well (in-process dict plus `max-age=86400`), but `/leaderboard`, `/geo-stats` and similar are not. The in-process tile cache also empties on every Railway deploy or restart.

## 3. Plan

### Step 0: measure first (no code changes)

On a release build on a physical device, cold launch (force-quit first), record:
- Time to first byte, first paint and splash-hide for: signed-out launch, signed-in launch landing on `/`, and signed-in launch deep-linked to `/campaigns/trash-war`.
- Android: `chrome://inspect` remote debugging, Network and Performance panels. iOS: Safari Web Inspector (already enabled in `capacitor.config.ts`).
- Throttle to a slow connection (Slow 4G) as well as normal.
- From the same trace, note the JS transferred and the largest images on the campaign page.
- Also run `next build` with a bundle analyzer and record the first-load JS for `/`, `/campaigns/[slug]` and `/leaderboard`.

Write the numbers into this doc under a "Baseline" heading. Every later step is judged against them.

### Step 1: cut server time to first byte (safe, helps web too)

- Replace `getUser()` with `getClaims()` (local JWT check) in the layout-level components and the proxy where the full user object is not needed. Check the Supabase JS version in `package.json` supports it and that the project signs JWTs asymmetrically. Keep `getUser()` where a revocation check really matters.
- Fetch the profile once per request and share it between `AppHeader` and `LegalGate` (React `cache()` wrapper around a single helper).
- Take `has-pending-organizer-items` off the blocking path: cache it per user for a short window, or load it client-side after first paint.
- Parallelize the independent fetches on the campaign page into one `Promise.all`.

### Step 2: remove the double load

- Make `/` redirect signed-in users server-side (`redirect()`), or point the app's entry at the final route. Confirm in the baseline trace that this is a real cost before spending time on it.

### Step 3: defer non-critical native init

- Move push registration, the geolocation polyfill and the notification primer to after the splash hides.
- Decide on the splash floor: keep 1.5s, lower it, or hide as soon as the page is ready. Needs a product decision (see open questions).

### Step 4: images and bundle

- Move avatars and event photos to `next/image` (or at least `loading="lazy"`, explicit width and height, and smaller R2 variants). Start with the lists that show many avatars.
- From the bundle analysis, split anything large that is not needed for first paint on the map route (modals, panels, charts) behind `next/dynamic`.

### Step 5: repeat-launch caching (only if steps 1 to 4 are not enough)

- Evaluate a service worker for static assets and fonts. This version of Next has breaking changes, so read `node_modules/next/dist/docs/` first (per `frontend/AGENTS.md`). Risk: a bad service worker can serve stale code to installed apps and is hard to recall. Needs a kill switch.
- Add `Cache-Control` to the stable JSON endpoints and consider moving the tile cache out of process memory.

### Not recommended

Bundling the web app inside the native shell (static export) would give the fastest launch, but it breaks server-rendered pages and cookie auth and needs a full re-architecture. Only revisit if steps 1 to 5 fall short.

## 4. Safety and release notes

- The app is live in prod. Every step above is a web deploy, and web deploys reach the native app immediately because it loads the live site. There is no store review gap, so a regression reaches all app users at once. Test on a Vercel preview first, and on a real device pointed at it (`CAP_DEV_SERVER`).
- Auth changes (`getClaims`) must be tested for signed-out, signed-in, expired token and Apple/Google sign-in flows on both platforms.
- Per the mobile release rule, bundle any change that needs a new native build with other native changes. Nothing in steps 1 to 4 should need one.

## 5. Open questions

1. Is the 1.5s splash minimum a deliberate brand choice, or fine to shorten?
2. Which devices and connection speeds are the target (what do most users have)?
3. Is Railway in the same region as Supabase and as most users? Not checkable from the code.
4. What is the acceptable cold-launch target? Suggest picking one after the baseline, e.g. "map visible within X seconds on Slow 4G".

## 6. Done criteria

- Baseline recorded, then the same three traces repeated after each step, with the delta noted here.
- No regression in sign-in, deep links, push, or geolocation on iOS and Android.
