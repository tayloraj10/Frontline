# Group Data Portal — Scoping — 2026-08-11

**Status: Phase 1 (unified per-member stats view) and Phase 3 (CSV export) built 2026-08-11.** Not yet built: shareable visualization export, map snapshot export, Excel export, historical import. See `master-backlog.md` item under "Campaign system / events."

### What shipped 2026-08-11
- `GET /api/groups/{group_id}/stats` (`backend/app/api/routes/groups.py`, `_compute_group_stats`) — group aggregate + per-member breakdown, one block per campaign the group has activity in (never blended), `interval` filter (today/week/month/all). Reuses the `/geo-stats` dedup-CTE pattern for bag/pound metrics, scoped by `group_id` instead of geography.
- `GET /api/groups/{group_id}/stats/export.csv` — same data as CSV, gated to group admins (`_is_group_admin`) via a required `viewer_user_id` query param.
- `/groups/[slug]/stats` (`frontend/src/app/groups/[slug]/stats/page.tsx` + `GroupStatsView.tsx`) — member-gated page (redirects non-members to a "members only" notice), interval picker, per-campaign aggregate chips + ranked member list, admin-only "Export CSV" button. Linked from the group profile page's action row.
- Access model resolved per your call: all members can view; only admins can export (open question 1 from the original scoping — resolved, not deferred).
- Cross-campaign question (open question 2) resolved by never summing: each campaign the group has contributed to gets its own block.
- The `/submit` group-membership gap noted below was investigated and intentionally left alone — the client only ever offers groups the user already belongs to, so it's not reachable through normal use.

## The idea

A group's own deep-dive stats page, reachable from `/groups/[slug]`: every contribution the group has made, broken down per-member ("Maria logged 12 cleanups this month"), plus lightweight data-portal features — exportable visualizations for social media, and raw CSV/Excel export. Distinct from the public Geo Stats page (`/leaderboard`, `GeoStatsExplorer.tsx`) shipped this session: that page slices *all* activity by geography; this one slices *one group's* activity by member, over time, for that group's own use (recruiting pitch, transparency to members, proof-of-impact for social posts).

## What already exists that this should reuse, not duplicate

- **`contributions.group_id`** — already the join key that ties a contribution to a group. Set two ways: client-submitted on individual/team-total self-logging (`payload.group_id` in `contributions.py`, `/submit`) and server-resolved per-attendee on group cleanup events via `_group_for_credit()` (`cleanup_events.py`), which correctly picks whichever of the event's primary group or cohost groups (`cleanup_event_cohosts`) the specific attendee actually belongs to — so event-sourced `group_id` is more trustworthy than a naive "use the event's group" assumption would be.
- **Gap found while checking this** — `/submit`'s self-logging path (`contributions.py`) never checks that the caller is actually a member of the `group_id` they submit. There's no `group_members` membership check anywhere in that file. This means today a user can credit any group's total by passing an arbitrary `group_id` in the request body. Worth fixing (a simple `EXISTS (SELECT 1 FROM group_members WHERE group_id = :gid AND user_id = :uid)` check) independent of this page, but especially before a group data portal makes group totals more visible/exportable/screenshot-able than they are today.
- **Backend aggregation pattern from the Geo Stats work** (`leaderboard.py`'s `/geo-stats`, this session) — the dedup-before-join CTE for bag/pound metrics (`COALESCE(cleanup_id, cleanup_event_id)` deduped before joining `cleanups`, to avoid multiplying a team-split event's totals by attendee count) and the interval/scope-filter query shape both apply directly to "this group, this time range, broken down by member" — same shape, different `WHERE` clause (`group_id = :gid` instead of a geo scope). The per-member breakdown is a `GROUP BY user_id` over the same dedup CTE.
- **`leaderboard_entries` (entity_type = 'group')** — campaign-wide, all-time only, no time-slicing or per-member drill-down. Good for "how does this group rank," not for "what did this group actually do this month, and who did it."
- **`group_members`** — already has `role` (`admin`/member), reusable directly for gating (see open question below) and already the source of `isAdmin` per group surfaced elsewhere (`HostEventModal`'s group picker).
- **`/groups/[slug]`** (existing group profile page) — has member list/roles, hosted events (`GET /cleanup-events/group/{group_id}`) already. The data portal is a new sub-route/tab off this page, not a rebuild of it.
- **Cleanup event photos + `Lightbox`/`ReportPhotoButton`** — if the portal surfaces a photo grid (likely, for the social-export angle), reuse the existing gallery components rather than a new one.

## Proposed shape

### Core view: unified per-member contribution breakdown
One query, scoped to `group_id` + selected interval (reusing the Geo Stats page's interval picker convention — this week / this month / all-time), returning:
- Group aggregate: total value, contribution count, unique contributors, bags (small/large split) + pounds — same shape as `/geo-stats`'s `aggregate` block.
- Per-member rows: same fields, one row per `user_id`, sorted by total value — effectively `/geo-stats`'s `top_users` shape but scoped by `group_id` instead of geo.

This alone (no export, no visualization) is most of the value and should ship first — it directly answers "who on our team is actually contributing."

### Data portal features (beyond the stats view)
1. **CSV export** — raw per-contribution or per-member rows. Cheapest to build (no rendering pipeline), highest immediate utility for a group that wants to put numbers in their own spreadsheet/report.
2. **Shareable visualization export** — a designed, social-media-ready image (member leaderboard bar chart, group totals card) rendered client-side (canvas or an HTML node screenshotted, e.g. `html-to-image`/similar) rather than server-rendered, for the same "lift" reasons `RoutePreviewMap.tsx`'s existing screenshot/enlarge pattern was kept client-side.
3. **Map snapshot export** — a MapLibre `getCanvas()`-based static export of the group's activity footprint (where their contributions landed), reusing the choropleth/marker rendering already built for `CampaignMap`/`GeoStatsMap`.
4. **Excel (.xlsx) export** — same underlying data as CSV, needs a library (e.g. `exceljs` or `sheetjs`) since nothing in the stack currently produces `.xlsx`. Lower priority than CSV; mostly a "nicer for non-technical users" convenience on top of the same rows.
5. **(Longer-term, lower priority) Historical import** — let a group upload past cleanup data the app never captured. Flagged in the original ask as likely archival/display-only, not counted toward live points/leaderboards — folding pre-app activity into live scoring would reopen an anti-gaming hole (unverifiable claims of "we did this before we joined").

## Open questions (need a decision before building, not before scoping)

1. **Access level** — group-admin-only, or all members can view? Export (especially raw CSV/Excel with per-member breakdown) is more sensitive than a read-only view — plausible split is "any member can view the stats page, only admins can export," but that's a guess, not a decision.
2. **Single-campaign vs. cross-campaign** — a group can be active across multiple campaigns with incompatible value units (points vs. bags vs. lbs vs. campaign-specific `contribution_type`). Summing across campaigns without a real design decision would produce a meaningless blended number, the same trap called out for Community Goals scoping (`community-goals-scoping-2026-08-07.md`, item 3). Likely answer: default to one-campaign-at-a-time view (matches how `/groups/[slug]` and Trash War are the only real group-activity surface today) with cross-campaign as an explicit future tab, not a blended total.
3. **Fix the `/submit` group-membership gap first, or in parallel?** Given this page makes group totals more visible and exportable (screenshots go out on social media, spreadsheets go to who-knows-where), shipping the portal before closing the "any user can credit any group" gap means bad data is more likely to get amplified, not just sit quietly in the DB. Leaning toward fixing the membership check first, or at minimum in the same body of work.
4. **Visualization rendering approach** — confirm client-side canvas/DOM-screenshot is acceptable quality for social-media use before investing in it; server-side rendered images (e.g. a headless-browser screenshot service) would look more consistent but is real new infra the project doesn't have today.
5. **Cohosted-event attribution in the member breakdown** — since `_group_for_credit()` already resolves per-attendee to whichever cohost group they actually belong to, a cohosted event's total should already split correctly across the two groups' portals without extra work — worth a real test case (one event, two cohost groups, attendees from both) before assuming this, since it's untested for this specific reporting use case.

## Suggested phase order

1. Unified per-member contribution view (group aggregate + per-member breakdown, interval-filterable), reusing the Geo Stats page's backend aggregation patterns scoped by `group_id` instead of geography. Admin-only to start (simplest permission model, revisit per open question 1).
2. Fix the `/submit` group-membership gap (independent but strongly related — do before or alongside step 1 shipping broadly).
3. CSV export.
4. Shareable visualization export (member leaderboard card).
5. Map snapshot export.
6. Excel export.
7. (Future) Historical data import, display-only.
