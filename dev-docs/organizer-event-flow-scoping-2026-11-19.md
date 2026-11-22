# Organizer Event Flow: Phase-Driven Guidance and Flags (2026-11-19)

Scope for reworking the organizer view of the group event page (`frontend/src/components/cleanups/CleanupEventDetail.tsx`).

## Problems today

- The guided view is a 5-step stepper (Check in, Clean, Log, People, Photos) organized by task, not by event timing. The page does not know which step matters right now.
- Step 1 is crowded: RSVP/check-in card, join code, summary counts, then a collapsed "Who's here" toggle with the email button. The RSVP list is hidden behind a toggle.
- The attendee list is rendered twice (`checkinRosterSection` and `attendeesSection`).
- Nothing flags problems: unlogged totals, closeable trash reports, missing photos or routes, people not checked in.
- Nearby trash reports and team-total logs are fetched inside `LogTeamTotalForm`, so the page cannot see them.
- The page does not update itself; organizers must tap Refresh.

## Proposed model

1. **Phase derived from time.** Before, During, After computed from start, end and the check-in window. The page opens on the current phase. A phase tab bar lets organizers jump around, with a badge of open flags per phase.
2. **Flag strip at the top.** Each flag has a severity (action needed or heads up), one line of text, and a button that scrolls to or opens the relevant control.
3. **Each phase shows only what it needs.**
   - Before: RSVP list first, event details, join code, reminder email, offers.
   - During: checked-in X / Y going counter, not-checked-in list with one-tap check-in, join code, add attendee.
   - After: checklist (log totals, clear trash reports, photos, routes), per-attendee corrections collapsed by default.
4. **One attendee component** with compact and expanded modes, replacing the two lists.

## Flags

| Phase | Flags |
|---|---|
| Before | No RSVPs yet, event full, starts within 24h and no reminder sent (if reminder state is available) |
| During | N of M going not checked in, event started with 0 check-ins |
| After | Totals not logged (organizer_total mode), N trash reports eligible to clear, no photos, no routes, going RSVPs never checked in |

## Technical pieces

- Pure helpers: `getEventPhase(...)` and `getOrganizerFlags(...)` in a new lib file, easy to unit test.
- Hoist trash-report and team-total-log fetches from `LogTeamTotalForm` to the parent so flags and form share one source.
- Light auto-refresh (30-60s) only during the During phase.
- Keep the "Everything" view mode as an escape hatch.
- Backend gaps to verify: total-logged indicator on the event payload, reminder-sent state, storage for dismissed flags (v1 may skip dismissal).

## Open questions

- Event with no end time: fixed duration after start, or During until organizer marks done?
- Explicit "Close out event" action, or flags just clear as data arrives?
- Dismissal of "no photos or routes": permanent or always show?
- Off-page notifications (push or email) for flags like unlogged totals?

## Build order

1. Phase and flag helpers plus flag strip UI, wired to data already available.
2. Replace stepper with phase tabs; merge the two attendee lists.
3. Hoist report and log fetches; add report-eligible and totals-not-logged flags; auto-refresh in During.
4. Dismissible flags, if wanted.

## Status

Built 2026-11-19 (v1, uncommitted): phase helpers, phase tabs, flag strip, RSVP list first in Before. Decisions: no end time means After 4h past start; no explicit close-out action; no dismissal or off-page notifications. Deferred: hoisting report/log fetches into the parent (parent fetches only the report count), merging the two attendee lists, reminder-sent flag. Refine after review.
