# Cleanup Events: End-to-End Flow

> 🚧 **Beta** — group cleanup events are still under active development. Expect the
> details in this doc (especially multiplier interaction, see the scope doc's backlog
> note) to keep changing as the logic gets tightened up.

## In plain English

Cleanup events let a group schedule a real-world cleanup — like a Meetup or
Eventbrite listing — that other users can find on the map, RSVP to, and show up to.

**If you run a group:** you create the event (title, description, date/time,
location, optional photo and capacity limit). You get a short code you can share
with attendees as a manual "I'm here" check-in option. You can see who's RSVP'd at
any time, and on the day of, who's checked in — and if someone forgets to log their own bags
before leaving, you can log it for them so they still get credit — you'll see
"logged by an organizer" on that entry, and it always uses the same point values as
if they'd logged it themselves.

**If you're attending:** you find the event on the map or on the group's page,
RSVP, and show up. When you arrive, you check in either automatically (the app
notices you're nearby during the event) or by typing in the organizer's code.
Logging your bags works exactly like it does for any other cleanup — take a photo,
enter your bag counts — except it happens through the event page.

**A few things worth knowing:**
- Cleanup events **never get a bonus multiplier**, even if there happens to be a
  "double points" event running elsewhere in the campaign at the same time. Regular
  cleanups can get bonus multipliers; group events intentionally don't, so the
  points stay predictable no matter when a group happens to schedule.
- Cleanup events **do still count toward claiming territory** on the map, same as
  any other cleanup.
- Reporting/resolving a trash hotspot works completely independently of all this —
  you can check in to an event and clear a nearby hotspot report in the same trip,
  and neither affects the other.

---

## Technical flow

Group-hosted, RSVP-able one-off cleanups (Meetup/Eventbrite-style), layered on top of
the existing point-based contribution system. A cleanup event is just a `cleanups` row
with `is_group_event = true`, a `group_id`, and a `join_code`.

### For group admins (organizers)

1. **Create the event** — `POST /cleanup-events` (gated: caller must be a
   `group_members.role = 'admin'` row for the group). Takes title, description,
   schedule, a pin-drop location, optional image, optional capacity
   (`max_attendees`), and an optional external link. The server resolves the
   location to a `geo_unit_id` the same way `/submit` does (H3 or point-in-polygon,
   depending on the campaign) and generates a unique 6-character `join_code`
   (ambiguity-free alphabet, no `0/O/1/I/L`) for the manual check-in fallback.
2. **Edit or cancel** — `PATCH /cleanup-events/{id}`, same admin gate. Setting
   `status: "cancelled"` is how an event is cancelled; there's no delete.
3. **Share the join code** — visible to admins only via `GET /cleanup-events/{id}`
   (`join_code` is omitted from the response for non-admins and from the public
   list endpoints entirely — it's a check-in secret, not public data).
4. **Log a contribution for someone who forgot** — `POST
   /cleanup-events/{id}/log-for-attendee`, admin-gated, body is
   `{attendee_user_id, small_bags?, large_bags?, pounds?, photo_urls?}`. This calls
   the same scoring path as a normal submission but credits the attendee, not the
   organizer, and stamps `contributions.recorded_by_user_id` with the organizer's id
   for an audit trail. It also upserts the attendee's `cleanup_rsvps` row
   (`status='going'`, `checked_in_at` set if not already). **No score multiplier
   applies** to this path (see "Interaction with timed events" below).
5. **View the roster** — `GET /cleanup-events/{id}` returns every RSVP with status,
   check-in time, and now a per-attendee bag breakdown (`small_bags`/`large_bags`),
   alongside the event-wide total. The frontend's "Log for them" button appears next
   to any attendee row where `checked_in_at` is still null.
6. **History view** — the group page's admin-only "Event History" panel shows every
   past/cancelled event (`GET /cleanup-events/group/{id}` returns the full set only
   when the viewer is an admin; non-admins only get upcoming, non-cancelled events).
   Each row is badged Cancelled / Ongoing / Over based on server-computed,
   time-based flags — not the `status` column, which isn't reliably kept in sync
   with real-world timing.

## For regular users (attendees)

1. **Discover** — events show as group-logo map markers (campaign map) and in the
   group's own page under "Upcoming Events." Markers grey out/disappear once the
   check-in window has closed (event end + grace period), then drop off entirely a
   day later.
2. **RSVP** — `POST /cleanup-events/{id}/rsvp`, `{user_id, status}` where status is
   `going`/`maybe`/`cancelled`. Upserted (one row per user per event). If the event
   has a capacity, going-count is checked under a row lock so two concurrent RSVPs
   can't both squeeze into the last spot.
3. **Check in on arrival** — `POST /cleanup-events/{id}/check-in`, two ways to
   satisfy it:
   - **Live location**: the caller's lat/lng, verified server-side to be within
     `CLEANUP_EVENT_PROXIMITY_METERS` (150m) of the event.
   - **Join code**: typed in manually (shouted-across-a-parking-lot fallback for
     unreliable GPS) — exempts the proximity check but *not* the time window.

   Both paths are only accepted inside the check-in window: `scheduled_start - 30min`
   through `(scheduled_end or scheduled_start) + 120min`. Checking in sets
   `cleanup_rsvps.checked_in_at`, upserting the row if the user never RSVP'd first.
4. **Log your own contribution** — the normal `POST /contributions/submit` flow,
   with an optional `cleanup_event_id` in the payload. When present:
   - The multiplier lookup is skipped entirely for that contribution
     (`apply_multiplier = cleanup_event_id is None`).
   - On success, the user's `cleanup_rsvps` row is upserted with `status='going'`,
     `checked_in_at` (if not already set), and the new `contribution_id` — so
     self-logging *is* attendance, independent of whether the user separately
     checked in first. "Attended" = "has a linked contribution."
   - The frontend suppresses the active-multiplier banner/fetch in this mode and
     shows a blue event-mode indicator instead, plus an in-range banner if the
     event's check-in window is currently open.

## Interaction with other system events

**Hotspots (`problem_reports` / boss spawns)** — orthogonal and fully compatible.
Hotspot resolution (`resolve_report_id` on `/submit`, proximity-checked against a
report, clears it and potentially resolves a `boss_spawn` campaign event) runs
*before* `record_contribution` is called and doesn't look at `cleanup_event_id` at
all. A user can check in to a cleanup event and, in the same submission, resolve a
nearby hotspot report — both effects apply independently.

**Timed events / score multipliers (`campaign_events` with
`effect_config.type = 'score_multiplier'`)** — **cleanup events never receive a
multiplier**, by design. This is enforced in exactly one place:
`record_contribution`'s `apply_multiplier` flag, which is `False` whenever
`contribution_type == "cleanup"` and either `cleanup_event_id` is set (self-log) or
the contribution came through `log-for-attendee` (organizer-log). A concurrent
multiplier active elsewhere in the campaign (or even over the same geo_unit, for a
non-event submission) is unaffected — the flag only suppresses the multiplier
*lookup* for that one contribution, it doesn't touch the `campaign_events` row
itself. Bag values themselves are still computed the same way (`SMALL_BAG_VALUE=1`,
`LARGE_BAG_VALUE=3`) — only the multiplier step is skipped.

**Territory claiming** — unaffected by any of the above. Every cleanup-event
contribution (self-logged or organizer-logged) still flows through
`record_contribution`'s shared tail, so it upserts `territory_claims` and can flip
top-claimer status exactly like a normal submission — group events fully
participate in territory scoring, they just never carry a bonus multiplier.

## Key files

- `backend/app/api/routes/cleanup_events.py` — event CRUD, RSVP, check-in,
  organizer-log endpoints.
- `backend/app/services/contribution_scoring.py` — shared scoring tail
  (`record_contribution`), used by both `/submit` and `log-for-attendee`.
- `backend/app/api/routes/contributions.py` — `/submit`'s `cleanup_event_id`
  handling (lines ~171-180, ~320, ~323-340) and hotspot-resolution logic
  (unaffected by cleanup events, lines ~245-302).
- `frontend/src/components/cleanups/CleanupEventDetail.tsx` — RSVP/check-in UI,
  attendee list with per-person bag breakdown, organizer "Log for them" modal.
- `frontend/src/lib/cleanupEvents.ts` — client helpers + types.
