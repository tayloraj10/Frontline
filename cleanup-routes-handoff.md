# Handoff: Cleanup Routes (Phase 3)

Context file for picking up Phase 3 of the cleanup-events/routes/neighborhoods plan in a fresh session at **medium effort**. Original full plan (all 3 phases, written in plan mode): `C:\Users\taylo\.claude\plans\temporal-singing-zebra.md`.

## Status: Phase 1 & 2 shipped and in production. Phase 3 (this doc) not started.

### Phase 1 — NYC Neighborhoods Overlay: done

Built as a purely visual "mosaic" layer — no scoring interaction, no shared code paths with contributions/territory. Toggle defaults off each session (no persistence).

- **Data pipeline (one deviation from the original plan):** the plan assumed the seeder would read GeoJSON directly. In practice the raw NYC Open Data NTA export was large enough that a separate simplification step was added: `POST /admin/simplify-nyc-neighborhoods` (`backend/app/api/routes/admin.py`) converts/simplifies `backend/data/nyc_neighborhoods_raw.geojson` → `backend/data/nyc_neighborhoods.geojson` (CPU-bound, run once, tolerance/precision tunable via query params). The seeder (`NycNeighborhoodSeeder` in `backend/app/services/seeders/nyc_neighborhoods.py`) reads the *simplified* file and raises `FileNotFoundError` with a pointer back to that endpoint if it hasn't been run yet. Seeding itself still goes through the standard registry (`unit_type='nyc_neighborhood'`, batched upsert on `(unit_type, unit_id)`, 500/batch), matching [[feedback_seeding]].
- Same seeder run also computes adjacency (`ST_Touches` self-join) into `geo_unit_adjacency`, consumed by `GET /tiles/nyc-neighborhoods/adjacency` (`backend/app/api/routes/tiles.py`, in-process cached like the other tile endpoints).
- Tile endpoint `GET /tiles/nyc-neighborhoods/{z}/{x}/{y}.mvt` is registered **ahead of** the generic `/{campaign_id}/{z}/{x}/{y}.mvt` route in `tiles.py` — both routes have the same four-segment shape, so without the explicit ordering a literal `"nyc-neighborhoods"` path segment would get swallowed by the generic route and fail UUID validation on `campaign_id`. Worth remembering if more campaign-independent tile endpoints get added later.
- Frontend (`CampaignMap.tsx`): fetches the adjacency map once on mount, runs a greedy graph-coloring pass (randomized visit order against a fixed palette sized to stay comfortably above the observed max adjacency degree of ~6, so it never runs out of distinct colors for a neighbor set) building a MapLibre `match` expression for `fill-color`. Added beyond the original plan: hover tooltip and click handler on `nyc-neighborhoods-fill` showing the neighborhood name. `LayerToggle.tsx` is a small standalone pill/checkbox button component (green when active) — first layer-toggle UI in the codebase, reusable if more optional overlays get added.

### Phase 2 — Group Cleanup Events + RSVP: done, plus a lot of follow-on hardening this session and prior ones
- `backend/app/api/routes/cleanup_events.py`: create/patch/rsvp/check-in (proximity+window or join code)/log-for-attendee, cancel.
- `backend/app/services/contribution_scoring.py`: shared scoring helper extracted from `/submit`'s tail; `/submit` now accepts `cleanup_event_id` for self-log attendance (upserts `cleanup_rsvps`, no multiplier).
- Frontend: `frontend/src/lib/cleanupEvents.ts`, `CreateCleanupEventForm.tsx`, `CleanupEventDetail.tsx`, group event map markers (group logo), geofence auto-prompt, group page upcoming-events list + admin history, edit/cancel page (`frontend/src/app/groups/[slug]/events/[id]/edit/page.tsx`), RSVP capacity limits, optional event external link, mobile UI condensing, radius circles on map, "Host Event" entry point next to "Log Cleanup".
- **This session's additions on top of Phase 2:**
  - Fixed check-in window bypass via join code (join-code check-in now also respects the scheduled window/grace period, not just proximity check-in).
  - Organizer edit/cancel UI completed; `CleanupEventDetail.tsx` RSVP/check-in block now correctly hides once an event is cancelled.
  - Fixed `AmbiguousParameterError` crash on `PATCH /cleanup-events/{id}` (cancel/edit without a new image) — `:image_url` was reused in both an `IS NOT NULL` check and an `ARRAY[...]::text[]` cast in the same statement; asyncpg couldn't infer its type when NULL. Fixed with explicit `CAST(:image_url AS text)` at both sites in `backend/app/api/routes/cleanup_events.py`.
  - Added a **blue "event mode" glow + banner** to `ContributeModal` (`frontend/src/components/contributions/ContributionPanel.tsx`), mirroring the existing orange hotspot treatment. `ModalShell`'s `glow` prop is now `"orange" | "blue" | false`. **Explicit precedence decided:** if a submission is tied to a cleanup event, the blue "counted toward the event, no bonus multiplier" treatment always wins over any active hotspot — events never get a multiplier, so showing hotspot glow alongside would be misleading. This was already the scoring behavior; the modal now surfaces it instead of silently showing neither banner.
  - Fixed newly-created events not appearing immediately on the campaign map: `frontend/src/app/campaigns/[slug]/page.tsx` was fetching cleanup events inside the page's `unstable_cache`-wrapped batch fetch (20s TTL, no revalidation on write). Moved the cleanup-events fetch out to an uncached `fetch(..., { cache: "no-store" })` call, matching the existing pattern in `frontend/src/app/groups/[slug]/page.tsx`.
  - **Known related gap, not fixed (not asked for):** no realtime cross-user update path for cleanup events/RSVPs on the map. `CampaignMap.tsx` only subscribes to `postgres_changes` for `problem_reports` and `territory_claims`; `cleanup_rsvps` is in the `supabase_realtime` publication (migration 034) but nothing consumes it, and `cleanups` itself was never added to the publication. A second user already on the map page won't see a new event live — only a fresh page load picks it up now that caching is fixed. Worth a small follow-up if live map updates matter.
  - **Discoverability note on organizer-log-for-attendee:** the per-attendee "Log for them" action in `CleanupEventDetail.tsx` (shown when `!r.checked_in_at && event.is_organizer`) is currently styled as plain `text-xs text-zinc-500 underline` text — easy to miss. Not changed yet; flagged as a possible small polish item if it comes up again.
  - `campaign-app-scope.md` was **not** actually updated with a "Group-hosted cleanup events + RSVP/attendance" checklist section despite a note at line 899 referencing one "below" — that section doesn't exist in the doc. Worth adding a proper `- [x]` entry for Phase 2 before or alongside Phase 3 work, per [[feedback_scope_doc]].

### Attendance model (for reference — three independent signals, none implies the others)
1. **RSVP'd** — `cleanup_rsvps.status`, intent only.
2. **Checked in** — `cleanup_rsvps.checked_in_at`, physical-presence verification (GPS proximity+window, or join code — both now respect the scheduled window). Gates the organizer's "log for attendee" UI visibility, not scoring.
3. **Credited/scored** — `cleanup_rsvps.contribution_id` set, via self-log (`/submit` with `cleanup_event_id`) or organizer-log (`/log-for-attendee`). This is the only thing that actually gates points.

## Phase 3 — Cleanup Routes (not started)

Full detail from the original plan, verbatim:

**Backend:**
- New endpoint (in `cleanup_events.py`, or rename the file to reflect both events and routes if that reads more clearly at implementation time) `GET /cleanup-routes/intersecting-geo-units` — accepts a raw GeoJSON `LineString` (not an encoded polyline — no polyline-encoding lib is installed, and PostGIS/`ST_GeomFromGeoJSON` handles raw coordinates natively), runs `ST_Intersects(geo_units.geometry, ST_GeomFromGeoJSON(...))` filtered to the relevant `unit_type` (e.g. `zip`), returns `[{geo_unit_id, unit_id, display_name}]` for the frontend picker.
- `POST /contributions/submit` — extended to accept an optional `route` (GeoJSON LineString) in place of/alongside a point. When present: store on `cleanups.route`; **re-run the same `ST_Intersects` query server-side** and reject with `400` if the client-submitted `geo_unit_id` isn't in that server-computed set (never trust the client's zip choice). Available for individual, group, and group-event submissions alike (orthogonal to Phase 2 — just an alternate geometry input on the same submit path).

**Frontend:**
- New `frontend/src/components/map/RoutePicker.tsx` — custom click-to-add-vertex tool built directly against MapLibre mouse events (consistent with the codebase's existing custom-built map-picker convention, no new drawing-library dependency), with undo-last-vertex and finish/clear controls, redrawing via a GeoJSON source `.setData()` on each click.
- On "finish route," call `GET /cleanup-routes/intersecting-geo-units` and show a simple chip/list picker for the user to choose exactly one zip from the intersecting set.
- `ContributeModal` — add a Point/Route toggle; Route mode swaps in `RoutePicker` for the location field and includes the route GeoJSON + chosen `geo_unit_id` in the submit body.
- Route rendering: a distinct styled `LineString` layer (accent color + width scaling by zoom, a subtle dash for a "trail" look) separate from `territory` fill colors.
- New shareable route detail page `frontend/src/app/routes/[cleanup_id]/page.tsx` (confirm during implementation whether an existing individual-cleanup detail view already exists to extend instead of building fresh — it does not yet exist as of this handoff) showing the route on a map, photo, metrics, and submitter — this is the "findable/followable, good for social media" surface the user asked for.

**Schema already in place for this (migration 034), dormant until Phase 3 uses it:**
- `cleanups.route GEOGRAPHY(LINESTRING, 4326)` — nullable column already exists on the `cleanups` table.
- `cleanups.geo_unit_id uuid REFERENCES geo_units(id)` — already exists.
- No further migration should be needed to start Phase 3; confirm both columns are still present and unused before building (`\d cleanups` or equivalent) since two follow-on migrations (035, 036) have touched `cleanups` since 034 shipped (added `max_attendees`, and an event-link column) — check they didn't rename/repurpose anything relevant.

**Verification plan:**
- Draw a route crossing 2+ known zip boundaries, confirm the intersecting-geo-units endpoint returns exactly those zips.
- Submit with a valid chosen zip and confirm success; attempt submit with a `geo_unit_id` not in the intersecting set and confirm server rejects with 400.
- Submit a route as an individual, as a group member, and tied to a group event, confirming all three paths work.
- Confirm existing point-based submission is completely unaffected.
- Update `campaign-app-scope.md` (and add the missing Phase 2 section while there), then stop for user testing/commit — no auto-commit, no `supabase db reset` ([[feedback_no_unrequested_db_reset]]), no Claude co-author attribution ([[feedback_commits]]).

## App context reminders for the new session
- Production app, live since 2026-06-23 — additive changes only, watch migration/deploy blast radius ([[project_in_production]]).
- Next.js 16 + FastAPI + Supabase (PostGIS) + MapLibre + Cloudflare R2.
- Seeding always goes through the Seeder registry + `POST /admin/seed`, never a standalone script ([[feedback_seeding]]).
- Mark completed items in `campaign-app-scope.md` after feature work ([[feedback_scope_doc]]).
