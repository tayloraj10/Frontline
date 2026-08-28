# Scoping: Live Cleanup Route Tracking

Start a cleanup → app samples your GPS location every X seconds in the background, building the route you actually walked → stop (or cancel) whenever → same photo/bags/pounds entry as the existing log-cleanup flow → route + tally saved together. This is a **third, new route-creation mode**, separate from the existing/planned manual "draw a route" mode (Phase 3, `RoutePicker.tsx`, still being kept as-is) — `ContributeModal` ends up with Point / Draw Route / **Track Route**.

**Decided 2026-08-22:** build both entry points (draw stays, tracking is new); go straight to full background tracking rather than a foreground-only first cut, since foreground-only was assessed as web-relevant but web support isn't wanted for this feature — native apps only, done the "best way possible" (background-capable) from the start.

## Platform availability

- **Native apps (Android/iOS) only.** No web support planned for this feature.
- Background tracking has no browser equivalent regardless (mobile browsers throttle/suspend `watchPosition` once backgrounded or the screen locks, and there's no web analog of `ACCESS_BACKGROUND_LOCATION`/iOS "Always" permission) — so "native only" isn't a limitation being accepted, it's simply the only place this version of the feature could run anyway.

## What exists today (reusable)

- `@capacitor/geolocation` ^8.2.1 already installed, currently used only for foreground one-shot/`watchPosition` calls (`GeolocateControl`, `useGPS`). Does **not** cover background tracking on its own — see below.
- Current permission declarations are foreground-only:
  - Android: `ACCESS_FINE_LOCATION` + `ACCESS_COARSE_LOCATION` only, no `ACCESS_BACKGROUND_LOCATION`.
  - iOS: `NSLocationWhenInUseUsageDescription` present; `NSLocationAlwaysAndWhenInUseUsageDescription` is also already in `Info.plist` (Capacitor template default) but nothing currently requests always-on access — inert boilerplate today, not a granted capability.
- `cleanups.route GEOGRAPHY(LINESTRING, 4326)` and `cleanups.geo_unit_id` columns already exist (migration 034), currently unused (dormant, reserved for Phase 3). Same `route` column backs this feature too — a live-recorded track is still just a LineString on submit.
- `contribution_scoring.py` is the shared scoring helper `/contributions/submit` already funnels through — reused as-is for a route-tracked submission's final tally, no new scoring logic.
- [[project_geolocation_shared_owner_refactor]] — `CampaignMap`'s `GeolocateControl` and `ContributionPanel`'s `useGPS` already share one control with known sharp edges (idempotent-start workaround for a real double-trigger bug). A background tracking session runs through a **completely separate** plugin/watch mechanism (see below) regardless, so it's naturally decoupled from that shared control — no risk of reintroducing that bug class, but also no shared code with it.

## Background tracking mechanics

- Requires `@capacitor-community/background-geolocation` (or equivalent — check current maintenance/version compatibility with Capacitor 8 before committing) — not currently installed.
- New native permission work required:
  - Android: `ACCESS_BACKGROUND_LOCATION` (separate Android 10+ runtime dialog, granted only after foreground location is already granted), plus a persistent foreground-service notification while a route is actively recording (Android requirement for any background-location service — shows something like "Frontline is tracking your cleanup route" with a tap-to-return/stop action). Google Play also requires a **background location permission declaration form** at submission time justifying the use case.
  - iOS: promote `NSLocationAlwaysAndWhenInUseUsageDescription` from inert to actually-requested. Apple's App Store review is notably strict on "Always" location — needs the permission prompt/rationale to clearly tie back to the visible, user-initiated route-tracking feature (this qualifies, since the user explicitly starts/stops it), and should request it contextually (when the user first taps "Track Route"), not at app launch.
- Sampling: interval-based ("every X seconds") per the user's framing, rather than distance-filtered — simpler to reason about and matches "build the route they took themselves" framing. Exact interval (e.g. 10-15s) is a tuning/battery-tradeoff decision to make during implementation; too frequent drains battery and produces GPS-jitter noise on a stationary user, too infrequent makes turns/corners look like straight-line cuts.
- Should keep sampling (and the foreground-service notification) alive through phone lock / app backgrounding / screen off — that's the entire point of choosing this over foreground-only.

## Relationship to Phase 3 ("Draw Route," not started)

Kept as its own mode, not replaced. Phase 3 is: draw a route by clicking vertices on a static map (`RoutePicker.tsx`), submit after the fact for a chosen zip's credit — no GPS involved. Track Route is: GPS builds the route automatically, chosen zip is computed the same way at the end.

Both end up as the same artifact — a `LineString` in `cleanups.route` — via different input methods, so they share the same backend validation and submission path (`intersecting-geo-units` + `/submit`'s route acceptance) and the same route rendering/detail page. Only the frontend capture mechanism differs. Build the shared backend once, and both `ContributeModal` modes (Draw Route, Track Route) sit on top of it.

## Proposed scope — backend

- Reuse Phase 3's planned `GET /cleanup-routes/intersecting-geo-units` (raw GeoJSON LineString → `ST_Intersects` against `geo_units`, filtered to `unit_type='zip'`) — shared by both Draw Route and Track Route.
- Reuse Phase 3's planned `/contributions/submit` extension: accept `route` (GeoJSON LineString) alongside bags/pounds/photos, store on `cleanups.route`, re-validate `geo_unit_id` server-side the same way (never trust the client's chosen zip).
- No new schema — `cleanups.route`/`geo_unit_id` already exist and are unused.
- No dedicated "tracking session" backend concept — a completed live-tracked route is the same submission payload shape as a drawn one. All the "live" behavior (interval sampling, background persistence, node editing) is a frontend/native-plugin concern; the backend only ever sees a finished LineString at submit time.

## Proposed scope — frontend

New full-screen (not modal-in-modal) flow, entered via a "Track Route" option alongside "Draw Route" wherever cleanup logging starts:

1. **Start** — request background location permission if not already granted (contextual prompt, not at app launch). Begin the background-geolocation plugin's tracking session; show a live map with the growing polyline rendered the same way Phase 3 already scoped (distinct `LineString` layer, accent color, trail-style dash), plus a running elapsed-time/distance readout.
2. **In progress** — position samples appended every X seconds via the plugin regardless of foreground/background state; persistent Android foreground-service notification stays visible the whole time, tap returns to the app. A visible, always-reachable **Cancel** control discards the in-progress route entirely (confirm before discarding, so an accidental tap doesn't lose a real session).
3. **Stop** — user ends the route intentionally. If total recorded distance/duration is very small, show a **confirmation prompt** ("this route looks really short — is this what you meant to capture?") before proceeding, rather than a hard minimum-length block — the user explicitly does not want a hard floor, just a chance to double check.
4. **Route review + node editing** — after stopping, show the recorded polyline with its individual GPS points editable (drag/delete a node) so a bad/wayward GPS jump (tunnel, urban canyon, brief signal loss producing a spurious spike) can be corrected before submit. Scope this as a real, not token, editing affordance — needs at least drag-to-reposition and delete-node; full add-node/re-order is a nice-to-have, not required for v1.
5. **Details entry** — hands off into the **existing log-cleanup modal UI** (same bags/small-large/pounds inputs, same photo upload) used by `ContributeModal` today, per the user's ask to make this identical to the current flow rather than a bespoke one — just with the route (instead of a point) as the location payload. Zip picker only appears if the route crosses more than one intersecting zip (same as Phase 3's plan).
6. **Submit** — same `/contributions/submit` call Phase 3 already scoped, route replacing point as the geometry.
7. **Mid-route logging — explicitly deferred.** User floated letting people log things *during* the route (not just at the end) but flagged it as probably unnecessary complexity for v1. Not scoped further here; revisit only if end-of-route-only proves insufficient in practice.

Geolocation ownership: this is a fully separate tracking mechanism from `CampaignMap`'s shared `GeolocateControl`/`useGPS` (background-geolocation plugin vs. `@capacitor/geolocation`'s foreground watch) — no shared state, no interaction with the [[project_geolocation_shared_owner_refactor]] sharp edges, by construction rather than by careful avoidance.

## Verification plan
- Background persistence: start a route, lock the phone / background the app / switch to another app for an extended period, confirm sampling continued throughout and the foreground-service notification stayed visible (Android) / tracking didn't silently stop (iOS).
- Interval sampling: confirm points land roughly every X seconds, not bursty or dropped, across a real walk.
- Cancel: confirm an in-flight route can be fully discarded at any point, with a confirmation step so it can't happen by accident.
- Short-route prompt: confirm a very short/brief route triggers the "are you sure" prompt rather than silently submitting or silently blocking.
- Node editing: confirm a bad GPS spike can be dragged/deleted before submit, and that the edited LineString (not the raw recorded one) is what's actually submitted.
- Multi-zip crossing + server-side zip rejection: same as Phase 3's existing verification plan.
- Permission flow: fresh install, deny background location, confirm a clear fallback/error rather than a silent no-op tracking session.
- Individual, group, and group-event submission paths, same as Phase 3's own verification plan.
- Real device pass on both platforms — background location behavior (especially iOS, which aggressively suspends background work) is not testable in a simulator/emulator with any confidence.
- Battery/behavior sanity check on a longer (30-60 min) real route before considering this done — background location is the single biggest battery-complaint risk in the whole app.

## Store/release impact
- New Play Store background-location declaration form required before this can ship in a production Android build.
- New App Store review scrutiny on "Always" location — have the in-app justification and permission-prompt copy ready before submitting a build with this feature enabled.
- Both are submission-time, not code-time, blockers — doesn't block building/testing this against internal test tracks, but should be accounted for in release timeline planning (`android-release-checklist.md`, `ios-release-checklist.md`).

## App context reminders
- Production app, live since 2026-06-23 — additive changes only, watch migration/deploy blast radius ([[project_in_production]]).
- No new migration expected — `cleanups.route`/`geo_unit_id` already exist and are unused.
- Native-app-only feature — no web parity work needed or wanted here.
- Mark progress here and cross-reference `campaign-app-scope.md` once work starts, per [[feedback_scope_doc]].
