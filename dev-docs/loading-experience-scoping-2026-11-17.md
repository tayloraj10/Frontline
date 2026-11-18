# Loading experience scoping (2026-11-17)

Problem: in the Capacitor app, tapping a button or link inside a page often shows nothing for 1 to 3 seconds before the next screen appears. Users do not know whether the tap registered. The goal is not to make the network faster first, it is to make every tap acknowledge itself instantly, then shrink the actual wait.

## 1. State of the `loading-improvements` branch

Remote only, 2 commits (2026-10-11), forked from master at 8cfc433 (2026-10-10). Master is now 136 commits ahead. 17 files, 225 lines added, nothing removed.

What is on it:
- `NavigationProgress.tsx` plus `lib/navigationProgress.ts`: a global top progress bar (emerald, eases to 85% then finishes when the route commits), a phone-only centered spinner that fades in after 150ms, and a 10s safety timeout. It listens for same-origin `<a>` clicks in the capture phase, and exposes `startNavigationProgress()` for programmatic `router.push`. Two keyframes plus utilities in `globals.css`, one line in `layout.tsx`.
- `PageSkeleton.tsx` and 11 identical `loading.tsx` files (groups, groups/[slug], leaderboard, partners, partners/[slug], profile, settings, team-events, users/[username], cleanup-events/[id]) that just render `<PageSkeleton />`.

Verdict: do not merge the branch. Start from master and take the NavigationProgress piece by hand.
- NavigationProgress is self-contained and sound. Dry-run merge shows only 2 conflict regions (almost certainly `layout.tsx` and `globals.css`, both just "both sides added lines"). Cherry-picking that file group is low risk.
- PageSkeleton predates the UI rework (bordered `rounded-2xl` rows, old container widths). Master cards are now `bg-zinc-900 rounded-[20px]` with a ring, so those skeletons would look wrong. Rebuild them to match the current look.
- Its route list misses all of Earn and Fund, which are the newest and busiest screens.

## 2. What master already has

- `loading.tsx` exists for only 3 routes: `/` (root centered spinner), `/campaigns`, `/campaigns/[slug]`. The other ~55 pages have none.
- Next 16.2.7. `cacheComponents` is not enabled, so the `unstable_instant` route from the Next docs is not available without a bigger migration.
- 22 `router.push/replace` calls (no pending feedback) and 4 plain internal `<a href>` tags (skip the client router).
- Pressed-state styling (`active:scale`/`active:bg`) is already in about 145 files, so the "tap feedback" is partly done on cards and buttons. The gap is feedback for the wait after the tap.

## 3. Why taps feel dead (hypotheses, measure before fixing)

How Next works here, per the 16.2 docs: a link to a dynamic route only prefetches up to the nearest `loading.tsx` boundary. With no `loading.tsx`, nothing useful is prefetched and the click blocks on the full server render of the destination (auth lookup, Supabase and FastAPI calls) before anything changes on screen. In the Capacitor remote-URL wrapper that wait includes a real round trip to Vercel and onward to Railway or Supabase.

Likely contributors, most to least:
1. No route-level `loading.tsx` on most pages, so the old screen just sits there until the new page is fully rendered.
2. Server pages doing slow sequential fetches (cold FastAPI, `no-store` fetches like `listGroupCleanupEvents`, auth plus data).
3. Prefetch only runs for in-viewport `<Link>`s in production builds. Map popup links and anything using `router.push` or a plain `<a>` get none.
4. In-page actions (submit, RSVP, join) that await a network call with no pending state.

Not yet known: whether the root `loading.tsx` spinner already appears on nav and the 1 to 2 seconds is something else (e.g. a layout-level wait or the webview). That is why step 0 below is a measurement.

## 4. Plan, in order

0. **Measure first (about 1 hour, needs your phone).** On a real device, app vs mobile browser: tap 5 representative paths (Groups list to group page, Earn to a site, Fund to a job, Profile, a map popup link) and record time to first visual change and time to content. Check the deployed site's response time for those pages directly. This tells us whether the wait is "no feedback" (fixable with the steps below) or "server genuinely slow" (needs step 5).
1. **Global feedback, 1 day.** Port NavigationProgress from the branch onto master (top bar plus the phone spinner after 150ms), wire `startNavigationProgress()` into the 22 `router.push` calls, convert the 4 plain `<a>` tags to `<Link>`. Gives every tap an immediate response with no per-page work.
2. **Route skeletons, 1 to 2 days.** Rebuild PageSkeleton in the current visual style, with a few variants (list of cards, detail page, form). Add `loading.tsx` for the heavy routes first: groups, groups/[slug], earn, fund, fund/jobs, profile, leaderboard, cleanup-events/[id], team-events, partners. This also enables partial prefetch so many navigations become instant.
3. **Pending state on buttons and in-page actions, 1 day.** A shared pending button pattern (spinner plus disabled) for submit, RSVP, join, claim, post. Use `useLinkStatus` for links that stay on the same layout.
4. **Prefetch audit, half day.** Make sure card and popup links are `<Link>`s so they prefetch; consider `prefetch` on high-traffic cards.
5. **Reduce the actual wait, only if step 0 shows slow servers.** Parallelize sequential fetches, add `unstable_cache` where data is public, check Railway cold starts. The `/groups` page already does this with a 30s cache and is the model to copy.

Ship steps 1 to 3 as one mobile-facing change. It is web-only (remote-URL wrapper), so it goes out with a Vercel deploy and does not need an app store release.

## 5. Open questions
- Do you want the phone-only centered spinner (branch default) or just the top bar? A bar alone is easy to miss on a phone.
- OK to defer `cacheComponents` and `unstable_instant`? It would make navigations truly instant but is a large migration; revisit after steps 1 to 4.

## 6. Status (2026-11-17)

Built, uncommitted, not yet checked on a device:
- Step 1: NavigationProgress ported (bar plus phone spinner after 150ms), `lib/useProgressRouter.ts` wraps `useRouter` in 15 files so programmatic navigation shows it too.
- Step 2: `components/ui/PageSkeleton.tsx` plus `loading.tsx` for groups, groups/[slug], earn, fund, fund/jobs, profile, leaderboard, cleanup-events/[id], team-events, partners.
- Step 3: `components/ui/Spinner.tsx`; spinners added to login, signup, group join/leave, event RSVP (per button) and check-in. `Button` already had a `loading` prop (57 uses); about 30 other files still use raw buttons with disabled-only pending state.
- Step 4: no `prefetch={false}` anywhere, so `<Link>` prefetch is default. Map popup links (raw HTML) now go through the client router via a delegated click handler in `CampaignMap`. Login/signup `window.location.href` redirects left alone on purpose (full reload refreshes auth).
- Step 5 not started: needs step 0 measurements on a phone first.
