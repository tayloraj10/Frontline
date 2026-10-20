# Team Events Phase 2 Scoping (2026-08-29)

Follow-on to the Team Events admin work (cover photo, editable teams, add-team). Covers: participation hierarchy, event stats page, submission review/moderation page, and geofencing (deferred).

## 1. Participation hierarchy: individual vs. group representative

Decisions from discussion:

- A **group opting into an event** picks a mode, default **cascade**:
  - **Cascade (default)**: every current member is auto-enrolled as an individual participant on the group's team, tagged as "representing" that group.
  - **Individual opt-in**: the group's join just sets a suggested/default team; each member still opts in themselves.
- An **individual joining an event** (whether or not their group has joined) chooses:
  - Join **as an individual** (no group attribution), or
  - Join **representing a group** they belong to (attributes their contributions to that group's rollup within the team).
- This choice is **changeable later**, and changing it **re-attributes existing contributions** to the new individual/group framing (not just future ones).
- Membership changes mid-event (someone joins/leaves the group after cascade already ran) need a defined behavior — proposed: joining the group while cascade is active auto-enrolls the new member; leaving the group does **not** retroactively remove past contributions, but stops future auto-attribution. (Flagging for confirmation, not decided yet.)
- **Multi-group members**: if a user belongs to more than one group, and picks "representing a group," they must choose *which* group (only one at a time — `representing_group_id` is a single FK, not a set). This applies whether one or both of their groups have opted into the event. If their chosen group's team differs from another of their groups that's also in the event, that's fine — their contributions only ever attribute to the one group they picked. If the representing group hasn't opted in yet at all, joining "representing" it should either be blocked (group must opt in first) or should implicitly opt the group in on a team the user then also picks — leaning toward **blocked**, since a group's team choice belongs to a group admin, not an individual member picking on the group's behalf. Team is always dictated by the represented group's chosen team when representing (can't independently choose team while representing); switching to "individual" frees up team choice.

### Schema sketch

`team_event_participants` (per the original plan) needs to grow from a strict user-XOR-group row into something that captures "individual, optionally representing a group":

- Keep `participant_type` but repurpose: every *scoring* participant is effectively a user row. A `group` row becomes the **group's own opt-in record** (its cascade setting + chosen team), not a scoring entity itself.
- Add to the table (or split into two tables — leaning toward two, cleaner):
  - `team_event_group_participants`: `id, team_event_id, team_id, group_id, cascade_mode CHECK ('cascade_all_members','individual_opt_in'), joined_at` — one row per group per event.
  - `team_event_participants` (individuals only): `id, team_event_id, team_id, user_id, representing_group_id NULL REFERENCES groups, joined_at, updated_at`. Unique on `(team_event_id, user_id)`.
- `contributions.city_event_team_id` stays as-is (resolved from the individual's row at submit time); for stats rollups we join through `representing_group_id` rather than storing group attribution directly on the contribution — so changing a participant's representation choice re-attributes automatically (no backfill needed on the contribution rows themselves).
- A DB trigger or app-level job on group-membership insert handles auto-enroll-on-join while cascade is active and the event isn't completed/cancelled.

This is the piece most likely to need a design pass before migration — proposing to nail this down first since items 2 and 3 (stats, review) both read through this model.

## 2. Event data-stats page

New tab/page off the event detail page (`/team-events/[id]/stats` or similar), pattern-matched off:
- Geo stats on the leaderboard (breakdowns by area)
- Group stats + deep-dive (per-group totals, member lists, trend)
- Campaign stats available to admins (aggregate charts, contributor counts)

Per the hierarchy above, this page shows, per team: team total, then a breakdown by group (groups that joined that team, with their aggregate) and a breakdown by individual (including individuals not representing any group). Public-facing (same audience as the event page), read-only.

## 3. Submission review page for delegated organizers

New page off the event detail page (e.g. `/team-events/[id]/review`), accessible to `event_manager`s **and** that event's `team_event_organizers` (the existing admin -> group events review UI is manager/admin-only today). Lets an organizer:
- View all submissions attributed to the event
- Edit bag counts/value (reuses the existing `PATCH /team-events/{id}/submissions/{contribution_id}` route)
- Flag/remove a contribution from counting toward the event (sets `review_status = 'flagged'`, already excluded from scoreboard sums per the original plan)

This overlaps with the existing admin -> group events review screen; that one stays for admins, this is the same backend route surfaced on a lighter, organizer-facing page reachable without going through `/admin`.

## 4. Geofencing per team (deferred)

Per-team geo boundary made of manually-selected pieces from a loaded geo unit (e.g. pick "Chicago" then manually include/exclude specific census tracts/neighborhoods within it), with a map-based picker UI. Confirmed **deferred** — blocked on geo-unit data loading work (Phase 3 in the original plan) and is its own map-UI effort. Not scoping further until geo units are loaded.

## Proposed build order

1. Nail down the participation-hierarchy schema (section 1) — this gates everything else. Needs a migration; will confirm exact table shape before writing it.
2. Backend: group cascade join + individual join/representing-choice endpoints, re-attribution on choice change.
3. Stats page (section 2) — depends on 1/2 for the group/individual breakdown.
4. Review page (section 3) — mostly independent, could actually be done in parallel with 1 since it reuses the existing submissions route.
5. Geofencing (section 4) — later, after geo-unit loading.
