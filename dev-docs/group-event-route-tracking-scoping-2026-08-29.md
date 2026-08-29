# Scoping: Tracked Routes for Group Events

Attendee opens a group cleanup event page, logs in, taps "Track my route" → same live-GPS background-tracking UI as individual route tracking (close the window, keeps recording, photo-capture nudges) → submits like today, scoped to that event → new "Routes & Photos" view on the event page shows everyone's tracked routes and photos together.

This is a **wiring/UI feature on top of the existing individual tracking stack**, not a new tracking mechanism — [[live-route-tracking-scoping-2026-08-22]] already built background GPS tracking, node editing, and submission. Nothing about *how* a route is recorded changes here. What's missing is (1) an explicit entry point on the event page instead of relying on proximity auto-detection, and (2) a way to see multiple attendees' routes/photos together, which doesn't exist anywhere today — the only multi-route surface currently is the campaign map's routes layer, and there's no event-scoped aggregation at all.

## What exists today (reusable as-is)

- `useRouteTracking.ts` + `TrackRouteScreen.tsx` + `ContributionPanel.tsx`: full start/tracking/review/submit lifecycle, background survival via the native plugin (works with the window closed — the app-kill case is the one localStorage-resume already covers, per its own comments), the "you can close this window" messaging, the photo-nudge toast, node editing, short-route confirm. **None of this needs to change** for group events.
- `POST /api/contributions/submit` already accepts `cleanup_event_id` alongside `route`/`route_photos`, and already upserts a `cleanup_rsvps` check-in row when it's present — submitting a tracked route during an event already counts as attendance today, no backend change needed for that part.
- `contributions.cleanup_event_id` (migration `039_cleanup_event_contribution_link.sql`) already links a submission to its event, independent of `contributions.cleanup_id`/`cleanups.route`. This is the join key the new "everyone's routes" view needs — **no new schema required**.
- `RoutePreviewMap.tsx` already supports a `photos`/`onPhotoSelect` multi-marker mode and an `isEvent` color variant — built for exactly this kind of display, just never called with more than one route.
- `CleanupRouteDetail.tsx` / `/routes/[cleanup_id]` is a working single-route detail page — reusable as the "view full route" destination when someone taps into one attendee's route from the new event-routes view.

## Gaps this feature needs to fill

1. **No explicit "track for this event" entry point.** Today, an event-linked submission only happens if `ContributionPanel`'s proximity check (`nearbyCleanupEvent`, computed from `userLocation` vs. event location within a radius + scheduled-time window) happens to fire on the *main campaign map*. `CleanupEventDetail.tsx` itself surfaces no tracking/submission UI at all. The user's ask is explicitly "once an attendee logs in we give them the option" *on the event page* — that has to be a real, visible button there, not an implicit side effect of standing near a pin on a different page.
2. **Track mode is currently admin-gated.** `ContributionPanel.tsx` (~line 1131) only shows the 🛰️ Track option when `(isIOSNative() || dev) && isSiteAdmin` — live tracking hasn't shipped to regular users yet at all. This feature can't launch broadly until that gate lifts; **decision needed**: does this ship as an extension of the same eventual general release, or does it need its own explicit go-ahead separate from individual tracking's rollout? Scoped here assuming it rides the same gate/release as individual tracking, since it's the identical underlying mechanism.
3. **`organizer_total` events have no self-submission path at all.** Attendees can't self-log anything (route or otherwise) when an event is in that logging mode — only the organizer enters one aggregate haul. Route tracking for group events only makes sense for `logging_mode === "individual"` events; this needs to be an explicit condition on showing the "Track my route" button, not just a UI nicety.
4. **No multi-route/multi-photo aggregation endpoint or view exists anywhere.** Needs a new backend query and a new frontend page/section.

## Proposed scope — backend

- New endpoint, `GET /cleanup-events/{cleanup_id}/routes` (in `cleanup_events.py`, alongside the other `/{cleanup_id}/...` endpoints):
  ```sql
  SELECT cl.id, cl.route, cl.route_photos, cl.route_distance_meters,
         cl.metrics_small_bags, cl.metrics_large_bags, cl.metrics_pounds,
         cl.image_urls, cl.created_at,
         p.id AS user_id, p.username, p.display_name, p.avatar_url
  FROM contributions c
  JOIN cleanups cl ON cl.id = c.cleanup_id
  LEFT JOIN profiles p ON p.id = c.user_id
  WHERE c.cleanup_event_id = :cleanup_id AND cl.route IS NOT NULL
  ORDER BY cl.created_at ASC
  ```
  Returns one row per attendee-submitted route tied to the event (a person could in principle submit more than one route across an event — no dedup needed, just list them). No new tables/columns.
- No changes needed to `/contributions/submit` — `cleanup_event_id` is already accepted and already round-trips into `contributions.cleanup_event_id`.
- Optional, not required for v1: also stamp `cleanup_event_id` onto the `cleanups` row itself (new nullable column) so the campaign-map routes layer could someday style/filter event-submitted routes the way `is_group_event` styles event-definition rows today. Skipping for v1 since the `contributions` join above is sufficient for the new view and this doc's scope doesn't touch the map layer.

## Proposed scope — frontend

**1. Entry point on `CleanupEventDetail.tsx`:**
- Show a "🛰️ Track my route" button when: user is logged in, `event.logging_mode === "individual"`, and (matching the existing RSVP/check-in section's pattern) the event is currently in its active window — reuse whatever proximity/time-window logic already gates the "Check in with my location" affordance, since both are "you're here now" gestures. RSVP status itself shouldn't hard-block it (submission already auto-check-ins, same as today's proximity path), but showing it only near/during the event avoids a random attendee tracking a route in the wrong place.
- Tapping it opens the same `ContributionPanel`/`TrackRouteScreen` flow used today, but pre-scoped: pass `cleanup_event_id`, `group_id`, and `campaign_id` down explicitly instead of relying on `nearbyCleanupEvent` proximity detection to infer them. This is the main behavioral change to `ContributionPanel` — accept an optional pre-bound event context that short-circuits the proximity lookup, so it works the same whether the attendee got here via the map's nearby-event detection or via this new explicit button.
- Everything downstream (permission request, live map, close-the-window messaging, photo nudges, node editing, bags/photos entry, submit) is unchanged — reusing the *same* components/hook, not a fork.

**2. New "Routes & Photos" view, linked from the event page:**
- New route: `/cleanup-events/[id]/routes` (mirrors the existing `/routes/[cleanup_id]` single-route page's naming), fetching the new `GET /cleanup-events/{id}/routes` endpoint.
- Layout: a scrollable list of per-attendee route cards, each reusing the same shape as `CleanupRouteDetail.tsx` — avatar + name, a `RoutePreviewMap` with that attendee's `route`/`route_photos` (`isEvent` styling), distance/bags/pounds line, tap-through to the full `/routes/[cleanup_id]` page for that individual route (reuses the existing detail page and its `ShareButton`, no new sharing work). Simplest reuse path: one `RoutePreviewMap` instance per card rather than trying to overlay every attendee's route on one shared map — keeps this to assembling existing pieces instead of building new multi-route map rendering.
- Empty state: "No routes tracked for this event yet."
- Link to this view from `CleanupEventDetail.tsx` — a "View routes & photos (N)" button/section, visible to anyone (not organizer-gated; this is about celebrating/showing participation, like the rest of the event page), shown once `N > 0`.

## Explicitly out of scope for v1

- Overlaying all attendees' routes on a single shared map (nice-to-have visualization; per-route cards via existing `RoutePreviewMap` is enough to ship the "see everyone's routes and photos" ask).
- Any change to `organizer_total` events — they stay log-only, no attendee tracking.
- Stamping `cleanup_event_id` directly onto `cleanups` rows / changing campaign-map route-layer styling for event-submitted routes.
- Any change to the underlying tracking mechanism, permissions, or native plugin — purely reusing [[live-route-tracking-scoping-2026-08-22]]'s work.

## Verification plan

- Track-my-route button only appears for logged-in users on `individual`-mode events, and is absent on `organizer_total` events.
- Starting tracking from the event-page button submits with the correct `cleanup_event_id` without needing the user to be geofenced into `nearbyCleanupEvent` first (this is the actual new behavior vs. today's proximity-only path).
- Closing the window/backgrounding mid-track from this entry point behaves identically to the individual flow (same hook, but confirm the event-context props survive the localStorage resume path in `useRouteTracking`).
- Submitting auto-checks the attendee in (`cleanup_rsvps.checked_in_at`) same as today's proximity path — confirm this still holds when entered via the new button.
- New `/cleanup-events/{id}/routes` endpoint returns only routes linked to that specific event (not every route the attendees have ever submitted).
- Routes & Photos view: multiple attendees' routes render as separate cards, tapping one leads to its existing single-route detail page, empty state shows correctly for an event with zero tracked routes.
- Link/count on `CleanupEventDetail.tsx` updates as new routes come in (can be simple refetch-on-navigate; realtime isn't required for v1 given `cleanup_rsvps` is the only thing currently wired to Supabase realtime, not `contributions`/`cleanups`).

## App context reminders

- Production app, live since 2026-06-23 — additive only ([[project_in_production]]). New endpoint and new page, no destructive migration.
- Blocked on Track mode's own general-availability decision (currently `isSiteAdmin`-gated) — flag this dependency to the user before starting build, since it changes whether this ships to all attendees immediately or stays behind the same admin gate.
- Cross-reference `campaign-app-scope.md` and `cleanup-events-dev-plan.md` once work starts, per [[feedback_scope_doc]].
