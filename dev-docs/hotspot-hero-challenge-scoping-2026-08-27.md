# Hotspot Hero Challenge — Scoping — 2026-08-27

**Status: scoping only, nothing built.**

## The idea

When a cluster of open trash reports sits close together, offer it up as a "hero challenge": clear every report in the cluster in one outing and get a large one-time point bonus on top of normal per-report scoring, instead of just clearing them one at a time with no extra payoff for doing the whole cluster. To make the cluster easy to actually run, generate a route that walks the player from one report to the next as each one gets logged. A hard requirement called out up front: some reports in a cluster may no longer have trash, or were inaccurate to begin with, so completing a challenge can't require *every* report in the cluster to be physically resolved — there needs to be a way to mark a report as invalid/no-longer-applicable so it drops out of the challenge without counting as a miss. An optional time limit for a bigger bonus is a nice-to-have, not a requirement.

## What already exists that this should be built from

- **`problem_reports`** (`002_event_system.sql`) — same table the [[random-bonus-spots-scoping-2026-08-26]] doc builds on. Has `location GEOGRAPHY(POINT, 4326)`, `severity`, `status` (`open`/`scheduled`/`in_progress`/`addressed`/`verified` — confirmed via `problem_reports.py`, no `invalid`/`dismissed`/`rejected` value exists today).
- **Cluster/density query already written** — `events.py`'s bonus-spot `suggest` endpoint (just built this session) already computes `nearby_report_count` via `ST_DWithin(pr2.location, pr.location, 150)` for a single report. The same shape of query, run as a `GROUP BY`-style clustering pass instead of per-candidate, is the natural starting point for cluster detection here rather than inventing new spatial SQL.
- **Claim-challenge mechanic** (`problem_reports.py` claim/before-photo/after-photo flow, `claim_challenge_multiplier` in `game_settings`) — an existing but *different* challenge concept: a single report, claimed by one user, with a before/after photo and a time window, rewarded with a score multiplier. Worth being deliberate that "Hotspot Hero" is a **new, cluster-level** concept, not an extension of this one — the existing claim-challenge is per-report and this is per-cluster. Don't conflate the two in naming or code; they can coexist (a report inside a hero cluster could still independently go through claim-challenge).
- **`campaign_events`** (`event_type` pattern) — same extensible table used for `boss_spawn`, `timed_event`, and now `bonus_spot`. A hero challenge is naturally another `event_type` here (e.g. `hero_challenge`) rather than a new table, following established convention.
- **Cleanup Routes (Phase 3)** — `cleanups.route`/`geo_unit_id` already exist for route-type cleanup logging, and `RoutePicker.tsx` already draws a route for a cleanup. **But this backlog item's status is itself unresolved** (`cleanup-routes-handoff.md` says not started, `campaign-app-scope.md` says shipped — flagged as a reconcile-first item in `master-backlog.md`). The route-generation piece of this idea depends directly on knowing what route infrastructure actually exists today, so **reconciling that status is a hard prerequisite**, not a nice-to-have, before scoping the route-through-the-cluster piece further.
- **No existing "invalid report" status or moderation action** — confirmed via `problem_reports.py`: there's no status value and no route for "this report is wrong/stale," only the Moderation tab's `content_flags` queue (`072_content_flags_resolution.sql`), which hides a reported *photo*, not the underlying report row. This is a real gap this feature needs to close.

## Proposed shape

### 1. Cluster detection
Periodically (or on-demand when an admin wants to spawn a challenge, mirroring the bonus-spot admin-triggered pattern rather than a cron) find groups of `problem_reports` where `status IN ('open', 'verified')` and each report has some minimum number of other qualifying reports within a radius (e.g. 3+ reports within 200m). This is a straightforward extension of the density subquery already written for bonus-spot suggestion, just returning a *set* of report ids per cluster instead of ranking single candidates.

### 2. Challenge entity
A `campaign_events` row, `event_type = 'hero_challenge'`, holding: the set of `problem_reports.id`s in the cluster (new join table, e.g. `hero_challenge_reports(event_id, report_id, status)` — a join table rather than a JSONB array of ids, since per-report status inside the challenge — pending/resolved/invalidated — needs its own query surface), a bonus point value, optional `ends_at` for the time-limit variant, and `status` (`active`/`completed`/`expired`) on the parent event same as other event types.

### 3. Invalidating a report without penalty
Add a way to mark a `problem_reports` row (whether inside a hero challenge or not — this is a standalone gap) as no-longer-valid: a new `status` value (e.g. `'invalid'`) plus who/why (`invalidated_by_user_id`, `invalidated_reason` — "no trash found" / "duplicate" / "inaccessible"). Open question below on who can do this. When a report inside a hero challenge flips to `invalid`, the challenge's completion check treats it as satisfied-and-excluded rather than a miss — i.e., "clear every report that's actually still there," not "every report that was ever in the cluster."

### 4. Route generation
Once a challenge's report set is fixed, generate an ordered path through the remaining (non-invalidated) reports — nearest-neighbor ordering from the player's current position is enough; this doesn't need real TSP optimization for cluster sizes in the single digits. Depends on the Cleanup Routes reconciliation above for how routes are represented/rendered today (`cleanups.route` shape, `RoutePicker.tsx` capabilities) so this doesn't duplicate or fight existing route infrastructure. As each report in the challenge gets resolved (via the existing per-report resolve flow, `resolve_report_id` opt-in on a contribution, same as any other report resolution), the UI advances to the next stop in the generated route.

### 5. Completion + bonus
When every report in the challenge's set is either resolved or invalidated, mark the `hero_challenge` event `completed` and award the bonus (a new contribution type, e.g. `hero_challenge_bonus`, same pattern as `cleanup_event_checkin`/existing milestone bonuses) to whichever user(s) contributed to it. Needs a design call (open question below) on solo vs. shared credit if multiple people log different reports within the same cluster.

### 6. Optional time element
If `ends_at` is set on the event, completing within the window awards an extra bonus on top of the base one (or scales it) — deliberately last on the build order since the user flagged it as "not necessary."

## Open questions

1. **Who can invalidate a report, and what stops abuse?** If any user can mark a report invalid to shrink a challenge down to something they've already basically finished (or to make an inconvenient report disappear generally, outside the challenge context too), that's a griefing/gaming vector. Likely needs either admin-only invalidation, or a user-submitted "this looks resolved/wrong" flag that goes through the existing Moderation `content_flags` queue rather than an instant status flip. Recommend routing through moderation review rather than a direct user action, at least initially.
2. **Solo vs. shared credit** — is a hero challenge meant to be run start-to-finish by one person in one outing (matching "knock them all out in one go" framing literally), or can multiple people each resolve different reports in the same cluster and share the bonus? The literal "one go" framing in the ask leans solo, but that's a much smaller potential audience per challenge than a shared-effort framing. Worth deciding before building the bonus-award logic, since solo vs. shared changes the join-table/award query shape.
3. **Cluster spawn trigger** — admin-triggered (matching the just-shipped bonus-spot pattern) or an automatic backend job? Admin-triggered is the smaller lift and matches the precedent just set.
4. **Minimum cluster size / radius tuning** — same "how special does this feel" tuning question as bonus spots; needs real report-density data to calibrate rather than guessing up front.
5. **Interaction with an active bonus spot or claim-challenge on the same report** — if a report is simultaneously part of a hero-challenge cluster *and* has its own claim-challenge or is inside a bonus-spot radius, do bonuses stack, take-the-max, or is one mode disabled while the other is active? The existing scoring code already does take-the-max between hotspot/bonus-spot/claim-challenge; a hero-challenge bonus is a flat award on completion rather than a per-contribution multiplier, so it likely stacks independently rather than needing to fit into that max-stacking rule — but worth confirming once bonus-spot's radius-jitter change (this session) is live, since a hero-challenge cluster and a bonus-spot's source report could now more plausibly overlap.
6. **Anti-fraud** — same standing gap flagged in the bonus-spots and payments scoping docs: contribution logging is client-trusted, no server-side proximity check today. A flat "clear a whole cluster" bonus is a bigger single payout than most existing multipliers, which raises the stakes on that gap somewhat, though not to payment-flow severity.

## Suggested build order

1. Reconcile Cleanup Routes status (blocking prerequisite for the route-generation piece — everything else here can proceed without it, but route generation can't).
2. Add the report-invalidation status + moderation-gated action (standalone value even without the rest of this feature — an admin/moderator today has no way to say "this report is wrong").
3. Cluster detection query + `hero_challenge` event type + join table, admin-triggered spawn (mirrors bonus-spot admin flow).
4. Completion tracking + flat bonus award, solo-credit model first (simpler; revisit shared-credit if that turns out to matter in practice).
5. Route generation through the cluster, once Cleanup Routes status is resolved.
6. Optional time-limit bonus variant, last.
