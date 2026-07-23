# Game engine scoring rules

Source of truth for how points/value get computed across the app, and how
territory credit gets assigned to a user's group. Living doc — update this
whenever the underlying constants or logic change, since these values are
easy to bury inside route handlers otherwise.

## Points per action

All values live in `backend/app/services/contribution_scoring.py` unless
noted. The client-submitted `value` field is ignored for `cleanup`
contributions — these are server-computed so a direct API call can't spoof
points.

| Action | Points | Notes |
|---|---|---|
| Small trash bag | **1** | `SMALL_BAG_VALUE` |
| Large trash bag | **3** | `LARGE_BAG_VALUE` |
| Pound of trash | **0.5** | `POUND_VALUE` — see caveat below, not always scored |
| Filing a trash report | **0** | Reports themselves aren't a contribution — no points until someone resolves or claims one |
| Resolving a report by cleaning near it (`resolve_report_id`) | same as the cleanup logged | No separate bonus, just marks the report addressed |
| Claiming a report as a challenge (`claimed_report_id`) | cleanup value × **1.5** | `CLAIM_CHALLENGE_MULTIPLIER` in `problem_reports.py` |
| Civic action (register independent, attend town hall, etc.) | **1** | flat value, `contribution_scoring.py:66` default for non-cleanup types |
| Solarpunk photo action | **1** | same flat default |
| Active campaign score-multiplier event | cleanup value × event's configured multiplier | `campaign_events` row with `effect_config.type = 'score_multiplier'`, stacks with the claim-challenge bonus |

**Pounds caveat:** pounds are only actually converted into points on the
*organizer-logged* paths — `log-for-attendee` and `log-team-total`
(`cleanup_events.py:977,1072`), where the organizer explicitly picks
`scoring_method: "pounds"`. On the self-log path (map "Log Cleanup" form,
`POST /contributions/submit`), bags are required to submit at all
(`ContributionPanel.tsx:806`, `smallBagsNum + largeBagsNum <= 0` blocks
submit) and pounds is an optional supplementary field that gets saved to
`cleanups.metrics_pounds` for the record but is **not** included in the
scored value — `record_contribution` only reads `small_bags`/`large_bags`
when computing a cleanup's value. Worth deciding if that's intentional or a
gap to close.

## Territory credit — which group gets it

Applies per contribution, computed in `record_contribution`
(`contribution_scoring.py:159-181`): each `geo_unit`'s top-scoring group
(by summed contribution value) claims that unit's territory. This part is
generic and doesn't change based on how the contribution was logged.

**What determines the `group_id` passed in varies by entry point:**

- **Map "Log Cleanup" / self-log** (`ContributionPanel.tsx`, `POST
  /contributions/submit`): the user manually picks their credit group from a
  pill selector, scoped to *any* group they belong to (`userGroups`) — not
  restricted to an event's host groups, even if `cleanup_event_id` is set.
  Their manual pick is sent straight through as `group_id` with **no
  inference or override** — see "Co-hosted events" below for why this
  matters.
- **Organizer logging for an attendee / team total** (`log-for-attendee`,
  `log-team-total` in `cleanup_events.py`): resolved automatically via
  `_group_for_credit` (see below) — the organizer doesn't pick a group at
  all.

### Co-hosted events (`cleanup_event_cohosts`)

Only applies to the two *organizer-driven* logging paths above, via
`_group_for_credit` (`cleanup_events.py:247-269`):

1. Build the host list: primary host group (`cleanups.group_id`) + all rows
   in `cleanup_event_cohosts` for that event.
2. Check which of those groups the attendee is a `group_members` row of.
3. **Belongs to none** → credit falls back to the **primary host group**.
4. **Belongs to exactly one host group** → credited to that group.
5. **Belongs to multiple host groups** → **primary host wins**, via
   `ORDER BY (gm.group_id = primary_group_id) DESC LIMIT 1`.
   - Primary + one or more co-hosts → primary.
   - Two or more co-hosts but *not* primary → **no defined tiebreak**;
     whichever row Postgres returns first from the unordered `array_agg` of
     co-host ids. Open question — worth deciding explicitly if it matters
     (e.g. most-recently-joined co-host, alphabetical, explicit priority
     order on `cleanup_event_cohosts`).

**Self-logging bypasses this entirely.** If an attendee self-logs from the
map instead of being logged by an organizer, they pick their own credit
group from *any* group they're in — which could be a co-host, the primary
host, or a group with no relation to the event at all. `_group_for_credit`
never runs on that path, so nothing about the event's host list constrains
or validates the choice. Whether that's the intended trust boundary (let
users self-attest their group) or a gap (self-logged credit should be
constrained to the event's actual hosts) is worth an explicit call — right
now it's just an artifact of the two paths being built separately.

Non-co-hosted events are unaffected by any of this — with an empty co-host
list, `_group_for_credit` always resolves to the primary group, same as
before this feature existed.

## Trash hotspot events (`boss_spawn`)

How a `campaign_events` row with `event_type = 'boss_spawn'` gets created and
torn down, end to end:

1. **Trigger.** Every `POST /problem-reports` submission calls
   `_check_report_triggers` (`problem_reports.py`), which counts open reports
   for that `campaign_id` + `geo_unit_id` and compares against each active
   `event_triggers` row of `condition_type = 'report_count'`
   (`condition_config.threshold`, default 5 if unset). If the count meets the
   threshold and there isn't already an active event of that `event_type` for
   the same geo unit, a `campaign_events` row is inserted with
   `status = 'active'` and `ends_at = NOW() + INTERVAL '72 hours'`.
2. **Effect.** The trigger's `effect_config` (e.g.
   `{"type": "score_multiplier", "multiplier": 2.0}`) is copied onto the new
   event row as-is. `_check_report_triggers` also reads `multiplier` out of
   it to build the event's `description` text (e.g. "for a 2× score
   multiplier!") — if `effect_config` has no `multiplier` key, the copy falls
   back to a generic "bonus XP" phrase. **Raw-SQL JSONB gotcha:** this insert
   uses a `text()` query, not the ORM, so `effect_config` must be
   `json.dumps(...)`'d in Python and cast with `CAST(:effect_config AS
   jsonb)` in SQL — passing a raw dict as the param lets asyncpg try to treat
   it like a string and throws `DataError: 'dict' object has no attribute
   'encode'`. Same pattern used by every other raw-SQL JSONB write in the
   seeders (`demo_data.py`, `solarpunk_preseed.py`, `campaigns.py`).
3. **While active.** `record_contribution` (`contribution_scoring.py:68-84`)
   applies the multiplier to any cleanup logged in that geo unit, gated on
   `status = 'active' AND (ends_at IS NULL OR ends_at > NOW())` — so the
   bonus stops applying at exactly the 72-hour mark regardless of whether the
   row has been formally expired yet (see next step).
4. **Expiry.** A Railway cron service
   (`backend/railway.events-expiry-cron.toml`, schedule `0 */6 * * *`) runs
   `scripts/run_events_expiry.py` every 6 hours, which POSTs to
   `/api/events/expire` (`events.py:128-148`). That endpoint flips any row
   with `status = 'active' AND ends_at < NOW()` to `status = 'expired'` and
   stamps `resolved_at`. Because this only runs every 6 hours, an expired
   hotspot can stay visible/`active` in the DB (and on the map) for up to ~6
   hours after its bonus has already stopped applying — the map/status field
   lags, the scoring never does.

## Test data

Event `22b5ea75-49ec-4287-b790-990409128b49` ("multi group test") is set up
with primary host **Clean Cities Collective** and co-hosts **Green Futures
Collective** and **Digital Detox Collective**. RSVP'd attendees cover each
membership case for `_group_for_credit`:

| User | Membership | Expected credit (organizer-logged) |
|---|---|---|
| jordan_r | none of the 3 | Clean Cities Collective (fallback) |
| marcus_w | Clean Cities only | Clean Cities Collective |
| sarah_k | Green Futures only | Green Futures Collective |
| sam_o | Clean Cities + Digital Detox | Clean Cities Collective (primary tiebreak) |
| maya_j | Digital Detox + Green Futures (no primary) | undefined tiebreak — worth watching |
| alex_c | all three | Clean Cities Collective (primary tiebreak) |

Log a contribution for each via `log-for-attendee`/`log-team-total` and check
`contributions.group_id` / `territory_claims` to confirm actual behavior
against the table above. To test the self-log bypass, log in as one of these
users and use the map's "Log Cleanup" form on this event instead — the
group pill selector should let you pick any of your groups regardless of
host status.

## Open questions / follow-ups worth tracking

- Undefined co-host tiebreak when an attendee is in 2+ co-hosts but not the
  primary (see above).
- Pounds-only self-log contributions currently score 0 points — confirm
  intentional or fix.
- Self-log group selection isn't constrained to an event's host groups —
  decide if that's fine or should be scoped down. Partially addressed: the
  pill now *defaults* to the preferred host group (primary, then a co-host),
  using the same preference order as `_group_for_credit`
  (`ContributionPanel.tsx`). The user can still manually override to any
  group they belong to — nothing server-side validates the final choice.
