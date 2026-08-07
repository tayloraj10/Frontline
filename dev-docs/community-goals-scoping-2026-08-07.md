# Community Goals — Scoping — 2026-08-07

**Status: scoping only, not started.** Mobile-first + Capacitor app store push takes priority over this — see `dev-plan-2026-08-03-mobile-first.md` and the Mobile section of `master-backlog.md`. This doc exists so the idea isn't lost and the next person (or future-me) doesn't have to re-derive the design from scratch.

## The idea

A visible, collective target — "help us hit X" — as opposed to the app's existing *competitive* surfaces (leaderboards) or *transient* surfaces (boss events). The pitch: prominent shared goals make the platform feel alive and in-progress, which is a growth lever for two audiences at once:

1. **New individuals** — a public progress bar with a real number moving is a stronger hook on a landing page than "sign up to compete."
2. **New groups** — if a group can set its own goal ("our group: 500 lbs by end of month") and watch it fill up, the app becomes their tracking tool for a real-world push they're already doing, not just another leaderboard entry. This is the more important audience for the "adopt this as your data-tracking platform" framing in the original ask.

## What already exists that this should reuse, not duplicate

- **`leaderboard_entries`** — materialized ranking per campaign, `entity_type` user/group. This is *ranking*, not a shared target — a leaderboard has no concept of "done." Goals need a different shape: one row is one target with a current/target pair, not a ranked list.
- **`event_triggers` / `campaign_events`** — admin-authored `threshold_reached` conditions already exist and already fire once when a condition is met (`campaign-app-scope.md` lines ~638-664). Conceptually a goal *completing* is the same shape as a threshold event firing — worth checking at build time whether goal completion can literally be a `campaign_events` row (`event_type = 'goal_completed'` or similar) instead of inventing a second completion-event system.
- **`user_notifications` + push pipeline** (`push-notifications-scoping-2026-08-06.md`) — goal-completion notifications should ride the same table/Edge Function/FCM pipeline already built, not a new one. Fan-out to *everyone who contributed toward the goal* is the same "notify N people from one DB event" problem already flagged as an open backlog item under "Social milestone pushes" (`master-backlog.md` line 13) — these two should be designed together, not separately, since they're the same fan-out primitive with different trigger conditions.
- **Milestone ladders** (`063_notification_push_eligible_and_achievements.sql`) — these are *individual* achievement thresholds (lifetime points, per-campaign contribution count, bags, pounds). Goals are the collective analog of the same crossing-range trigger pattern, just summed across many users/a group/a campaign instead of one profile.

Net: the trigger mechanics (crossing-range check on aggregate value, fire once, insert a notification/event row) are proven and reusable. What's actually new is (a) the goal-definition table itself, (b) a public-facing progress-bar UI component that doesn't exist anywhere yet, and (c) a self-serve group goal-creation flow.

## Proposed shape

### Scopes
- **Platform-wide** — one number across all campaigns (e.g. total lbs collected this quarter). Best fit for the logged-out landing page.
- **Per-campaign** — e.g. "5,000 contributions to Trash War this month." Natural home: campaign page banner.
- **Per-group** — the self-serve case. A group admin sets a target + metric + deadline; shows on the group's page and to members. This is the piece that most directly serves "encourage groups to adopt this as their platform."
- **Geo-scoped (borough/tract)** — deferred, lower priority; would piggyback on the existing `nyc_borough` work which is itself deferred (`project_nyc_borough_outline_deferred` memory).

### Rough schema (not final — just enough to reason about the shape)
```sql
CREATE TABLE community_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL, -- 'platform' | 'campaign' | 'group'
  campaign_id UUID REFERENCES campaigns(id), -- set when scope_type = 'campaign'
  group_id UUID REFERENCES groups(id),       -- set when scope_type = 'group'
  metric_type TEXT NOT NULL, -- 'points' | 'bags' | 'lbs' | 'contribution_count' | ...
  target_value NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL DEFAULT 0, -- materialized, kept in sync by trigger
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ, -- null = ongoing/no deadline
  is_public BOOLEAN DEFAULT TRUE, -- visible to logged-out visitors
  status TEXT DEFAULT 'active', -- 'active' | 'completed' | 'expired'
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
`current_value` updates the same way `leaderboard_entries`/milestone ladders do: a trigger on `contributions` (and wherever else a metric_type sources from) re-sums for any active goal whose scope matches the new row, and flips `status` to `completed` + fires a notification/event on crossing `target_value`.

### Where it needs to show up (this is the actual growth lever, not the schema)
- Landing/homepage — public, works logged-out. Highest-value surface for new-user acquisition and the one most worth getting right first.
- Campaign page — banner/widget for the campaign's own active goal(s).
- Group page — the self-serve group goal, visible to the group's members and (if `is_public`) anyone.
- Dashboard — "your group's goal" / "this campaign's goal" widget for logged-in users already in a group/campaign.

## Open questions (need a decision before building, not before scoping)

1. **Who can create platform-wide and per-campaign goals?** Presumably admin-only (reuses whatever comes out of the multi-tier admin roles backlog item, `master-backlog.md` line 27) — but group goals need a *group-admin*-scoped creation flow, which is new UI surface, not just a new table.
2. **Recurring vs. one-shot** — does a monthly group goal auto-roll into a new goal on completion/expiry, or does someone have to manually create the next one? Auto-roll is nicer UX but is meaningfully more logic (a cron or trigger that spawns the next period's row).
3. **Metric/campaign alignment** — campaigns already have per-type value semantics (bags/lbs/minutes/count depending on `contribution_type`, per `campaign-app-scope.md`). A goal's `metric_type` needs to match what that campaign actually tracks, which means the goal-creation UI needs to be aware of the parent campaign's contribution types rather than offering a free-text/all-metrics picker.
4. **Anti-gaming** — goal progress inherits the same anti-fraud gap already noted for cleanup contributions (no server-side proximity check, client-side only, deliberately deferred per `campaign-app-scope.md`). A visible public goal is a bigger incentive to game a submission than an individual leaderboard entry is — worth revisiting that deferral if goals ship.
5. **Cap on concurrent group goals** — one active goal per group at a time, or many? Simpler UI/mental model with one; more flexible (but noisier) with many.

## Suggested phase order (once this is picked back up)

1. Platform-wide + per-campaign goals, admin-created only, progress-bar UI on landing page + campaign page. This is the smallest lift because it reuses existing trigger/notification patterns and skips the group self-serve UI entirely.
2. Group self-serve goal creation (the bigger lift — new permission-gated UI flow, target/deadline picker, moderation concerns around what targets groups are allowed to set).
3. Recurring/rollover goals.
4. Geo-scoped goals (blocked on the same borough-data-in-prod dependency as the existing borough stats work).
