# Cleanup Events — Dev Plan

Working backlog for the group cleanup-events workstream. Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

---

## 1. Check why admin promotion isn't working

- [x] Group admin promoting another attendee to organizer (`promoteOrganizer` / `POST /cleanup-events/{id}/organizers`) — done.

## 2. Group admin should see themselves on the attendee list

- [x] Group admin managing an event now sees their own entry in the attendee list — done.

## 3. All members of a group event who contribute get credit for cleanup

- [x] Organizer can log one team total (bags or pounds) and split it as individual point credit across attendees, rather than requiring everyone to self-log. Done.
  - [x] Backend: `POST /cleanup-events/{id}/log-team-total` — splits total value equally across an organizer-chosen pool (checked-in vs. everyone going), supports per-attendee overrides (capped at the total, can't inflate it), re-runnable without double-crediting anyone already credited.
  - [x] Pounds-based scoring path added (`POUND_VALUE = 0.5`), organizer-selectable alongside the existing bags formula, scoped only to this endpoint.
  - [x] Points (equal-split and overrides) rounded to nearest 0.5 before being persisted, both server-side and mirrored in the client preview.
  - [x] Frontend `LogTeamTotalForm` in `CleanupEventDetail.tsx`: bag/pound inputs, pool selector, collapsed-by-default "Advanced options" with apply-to-all / clear-all and per-attendee override list (placeholders show the live computed per-attendee share).
  - [x] Full end-to-end verification pass done, tested locally.
  - [x] "Everyone going" pool reviewed — kept as-is since organizers can choose the checked-in-only pool when they want to guard against crediting no-shows; not a gap.

## 4. Zoom to user location by default

- [x] `CampaignMap.tsx`: on initial mount, automatically triggers the existing `GeolocateControl` (capped at `maxZoom: 14`) instead of waiting for the user to tap the locate-me button. The generic bounds fit (continent/world) still renders first, then the map flies to the user's actual location once permission resolves.
- [x] Guarded against yanking the view: if the user starts a real drag/zoom gesture (detected via `originalEvent` on `dragstart`/`zoomstart`, which is absent for our own programmatic initial fitBounds) before the geolocation fix arrives, the auto-recenter is skipped so a manual pan isn't overridden.
- [x] Falls back gracefully to the existing generic bounds fit if geolocation is denied, unavailable, or times out — no behavior change in that case.

## 5. Let event attendees upload photos to the event

- [x] Any attendee can add a photo directly to an event's Photos gallery, independent of the bags/pounds contribution-logging flows — no points, no territory credit, no contribution row. New `cleanup_event_photos` table (migration 044) + `POST /cleanup-events/{id}/photos` endpoint, merged into the existing `GET /cleanup-events/{id}` `photos` array alongside contribution-derived photos. "Add a photo" button in the Photos section header in `CleanupEventDetail.tsx`, available to any logged-in attendee on a non-cancelled event.

## 6. Support multiple groups hosting an event

- [x] Currently an event has a single `group_id` host. Design + implement co-hosting by more than one group. Done: `cleanup_event_cohosts` table, primary-host-admin-managed co-host list, credit-routing via `_group_for_credit` (primary preferred, then a co-host the attendee belongs to, else primary fallback), co-hosted events surfaced on every hosting group's page, host-logo stack on both the main map marker and the event detail mini-map.

## 7. Show location and map view on the event page

- [x] Event detail page shows a full map view of the event location/route via `RoutePreviewMap`, generalized to support point-based events (single lat/lng) alongside route-based events. Point events now have full parity with route events: basemap style toggle, buffer/check-in-radius zone toggle (`event.check_in_radius_meters`), and a group-logo-or-🧹-sweep-pin marker matching `CampaignMap.tsx`'s own cleanup-event pin styling.

## 8. Guard against event end time before start time

- [x] Backend: `CreateCleanupEventRequest` model validator rejects `scheduled_end <= scheduled_start`; `PATCH /cleanup-events/{id}` computes the effective start/end (new value or existing DB value, since PATCH is partial) and 400s if invalid.
- [x] Frontend: `CreateCleanupEventForm` (shared by create + edit) disables submit and shows an inline error under the "Ends" field when end ≤ start.

## 9. Territory summary card mislabels points as "bags"

- [x] `CampaignMap.tsx`'s territory summary card (and group-battle breakdown, contribution list) displays `total_value` / `contribution.value` — the **weighted point value** (`small_bags*1 + large_bags*3`, or `pounds*0.5` for team-total pound logging) — under the label "bags." This overstates or understates the actual physical bag count depending on the small/large mix, and pounds-based contributions don't correspond to a bag count at all.
- [x] **Decided fix: relabel, don't re-architect.** Changed "X bags total" / "X bags" copy to "X points" everywhere it's driven by `.value`/`total_value` in `TerritoryPanel` (territory summary header, group-battle breakdown bars, recent-activity contribution list) and in the `territory-fill` hover tooltip — no new column, no schema change. Internal var names (`bags` → `points`, `totalBags` → `totalPoints`, `maxGroupBags` → `maxGroupPoints`) updated to match. Genuine bag-count displays driven by `metrics_small_bags`/`metrics_large_bags`/`total_small_bags`/`total_large_bags` were left untouched.
- [x] Added an info modal, opened via a small "ⓘ" affordance next to the territory total, explaining small (1 pt) vs. large (3 pt) bag values and the pounds conversion (0.5 pt/lb), and that the territory total is points, not a literal bag count.
- [x] Correction: `TerritoryPanel` only backs `territory`-type campaigns (Trash War). Solarpunk (`hex_bloom`) has its own separate `HexPanel`, untouched by this fix. Touch Grass (`heatmap`) has no territory tiles at all (early-returns before the `territory-fill` layer is even added) — no zip/territory info card exists to mislabel in the first place. So this fix is Trash-War-only; Solarpunk/Touch Grass need no changes here.
- [x] Follow-up: also show the real physical bag count (small + large, summed from `cleanups.metrics_small_bags/large_bags` for the geo unit, not `.value`) alongside the points total, since bags picked up is what the campaign is actually about — points is a ranking mechanism, bags is the impact number. Info modal copy updated to explain both numbers.
- [x] Follow-up: show the small/large split, not just the combined count — on the zip total ("N bags picked up (X small, Y large)") and on each individual's Recent Activity row (via `contributions.cleanup_id` → embedded `cleanups(metrics_small_bags, metrics_large_bags)`), shown only when that contribution has its own dedicated `cleanups` row with bag data (self-log, log-for-attendee); team-total-split contributions (`cleanup_id IS NULL`) show points only, since there's no per-attendee bag breakdown to show.
- [x] Follow-up: enlarged the "ⓘ What are points?" affordance to a proper 32px circular button with a visible background (`h-8 w-8 rounded-full bg-zinc-800`), replacing an earlier invisible-padding-only attempt that was still too small to tap reliably on mobile.
- [x] Follow-up: removed em dashes from the info modal copy.
- [x] Fixed regression: the per-contribution `cleanups(...)` embed added for the small/large split was ambiguous — `contributions` has two FKs to `cleanups` (`cleanup_id` and `cleanup_event_id`), so PostgREST rejected the query and silently emptied the Recent Activity list for every zip. Fixed by disambiguating with `cleanups!cleanup_id(...)`.

## 10. Fixed: log-for-attendee bugs (pounds ignored, wrong bags shown, crash)

- [x] `log-for-attendee` was reusing the event's own `cleanups` row for every attendee instead of a dedicated row per attendee (unlike self-log) — caused displayed bags/pounds to always read the shared row (usually 0) instead of what was actually entered, and caused a Postgres `array_agg`/`cannot accumulate empty arrays` crash on `GET /cleanup-events/{id}` once 2+ attendees were logged this way.
- [x] `pounds` was accepted by the request model but never passed to scoring — logging pounds for an individual attendee silently awarded 0 points.
- [x] Fix: give each attendee their own `cleanups` row (mirroring self-log), and score pounds via `POUND_VALUE` when provided (pounds takes priority over bags if both are somehow present, mirroring team-total's mutual exclusivity).
- [x] Frontend: `OrganizerLogButton`'s "Log for them" modal shows small bags, large bags, and pounds inputs all at once, plus a "By bags" / "By pounds" scoring-method picker with live points preview per method — matching `LogTeamTotalForm`'s pattern for consistency. All fields are still saved for the event's record regardless of which method is picked for scoring.

## 11. Show group logo on territory a group controls

- [ ] When a zip code (geo unit) is captured/controlled by a group, show that group's logo (if they have one) somewhere on/in the zip on the map.
- [ ] If a group controls multiple touching (contiguous) zip codes, only show the logo once for the connected region, not once per zip.
- [ ] Open question: should this also apply to individuals with a profile picture, for zips captured by an individual rather than a group?
- **Deferred 2026-08-02**: user is turning off the territory-capture layer by default soon, so held off scoping/building this. Scoping research done (not acted on): ownership is currently only a color signal via feature-state, no group identity attached per-feature; no zip adjacency data exists (only seeded for the decorative NYC-neighborhoods overlay, reusable pattern via `ST_Touches`); group logos always render as DOM `Marker`+`<img>` today, never a MapLibre symbol/icon layer; individual-avatar-on-map has zero precedent anywhere in the codebase. Revisit if/when territory capture becomes a first-class surface again.

## 12. Unify geolocation into a shared hook/store (not cleanup-events-specific)

- [ ] `CampaignMap.tsx` owns a MapLibre `GeolocateControl`, and `ContributionPanel.tsx`'s `useGPS` hook independently calls into it (via `onGeolocateTrigger`/`geolocateControlRef`) to request location for its own forms. Both share one control object whose `trigger()` toggles tracking on/off rather than being idempotent — this already caused a real bug (dev-plan item #4, "zoom to user location by default") where the two callers' `trigger()` calls raced and canceled each other out. Worked around with a `startedRef`-guarded idempotent `startTracking()` helper in `CampaignMap.tsx`, but the underlying two-callers-sharing-one-toggle design is still fragile.
- [ ] Proposed fix: pull geolocation into a shared hook/store owned by `CampaignMap` (single `watchPosition()`, single source of truth for status/coords/error), with `ContributionPanel` reading from it instead of independently triggering the control. Google Maps-style apps avoid this class of bug the same way — one owner of geolocation state, other components just read from it.
- [ ] Not urgent — current behavior works via the idempotent-start workaround — but noted here so it isn't forgotten, and flagged as the "real" fix if geolocation bugs recur.
- **Deferred 2026-08-02**: scoped but not started, per user — didn't want to take on the manual QA burden right now. Estimate: ~1-2 focused sessions (`useGPS` already behaves like the target shared-hook design; main work is moving trigger/subscribe wiring from prop-drilled callbacks into a context/store, while preserving 5 subtle existing behaviors — toggle-idempotency guard, auto-recenter-suppressed-after-user-pans, deep-link `focusCoords` suppression, re-emit-last-known-position-on-demand, and the 5-way error code mapping incl. the synthetic "map still loading" code). No automated test coverage exists for this (browser Geolocation API, not easily unit-tested) — verification would be manual: map mount/pan/deep-link behavior, all 4 `ContributionPanel` sub-forms that call `gps.capture()` (contribute/log-cleanup, host-event, solarpunk-photo, report), the specific race scenario that caused the original bug, and ideally a real mobile device pass. `CleanupEventDetail.tsx`'s two one-shot `getCurrentPosition()` calls and `BusinessLocationMapPicker.tsx`'s independent admin control are out of scope for this refactor (different one-shot-vs-watch semantics) unless explicitly widened. Revisit when ready to take on the QA pass.

## 13. Stats bar: split "bags collected" into small/large/pounds

- [x] The Trash War stats bar (`CampaignStatBar` in `CampaignPageClient.tsx`) now surfaces a combined "Total bags" stat (`smallBags + largeBags`) alongside "Territories claimed," "Contributions," and "Hotspots," sourced from a campaign-wide `SUM` of `cleanups.metrics_small_bags/large_bags/pounds` (fetched server-side in `page.tsx`, kept live via a `cleanups` INSERT/UPDATE realtime subscription).
- [x] On mobile, the bar shows a single non-wrapping row by default (Territories claimed / Total bags / Contributions / Hotspots) with `overflow-x-auto` as a fallback if it doesn't fit; clicking a dropdown arrow next to "Total bags" reveals a second, visually-grouped row (centered pill styling) with the "Small bags" / "Large bags" / "Pounds" breakdown (pounds hidden when zero). On desktop (`sm:` and up) all stats show inline in one row with no click needed, since there's enough horizontal room; that row also falls back to `overflow-x-auto` if it were ever to overflow.

---

## Notes

- This doc was split out from ad-hoc conversation tracking on 2026-07-21; no prior numbered list existed in the repo for this workstream.
- Related but Trash-War-scoped backlog lives in `trash-war-feedback-backlog.md` (bag-size terminology, contractor-bag tier, contested-zone alerts) — don't duplicate those items here.
- Per [[feedback_scope_doc]] convention, completed items here should also get reflected in `campaign-app-scope.md` once shipped.
