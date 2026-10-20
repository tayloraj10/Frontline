# Granular bag-size/type tracking + cigarette points + points-basis choice — scoping

Reconciles master-backlog items "Granular bag-size/type tracking + cigarette
points + points-basis choice" and "Contractor bag tier" into one effort, per
the note on the former that they're the same real-world bag. Not started —
this doc is the design pass before any migration/code work.

## Goal

Today a cleanup log is just `small_bags` + `large_bags` (1pt / 3pt) or, on
organizer paths only, pounds. User wants to keep small/large as the scoring
backbone but let people optionally log *what kind* of bag/item they actually
picked up — 7 specific bag types, plus cigarette butts as a non-bag countable
unit — and have that detail show up in dashboards, not just feed the same two
buckets invisibly.

## 1. Bag type taxonomy

Confirmed via reference image (`c:\Users\taylo\Downloads\IMG_2457.jpg`) and
user's tier call (2026-09-02):

| key | label | approx size | legacy rollup | points |
|---|---|---|---|---|
| `utility_bucket_5gal` | Standard utility bucket | 5 gal | small | 1 |
| `grocery_plastic` | Grocery store plastic bag | 2-3 gal | small | 1 |
| `grocery_paper` | Grocery store paper bag | 4-5 gal | small | 1 |
| `kitchen_13gal` | Standard kitchen-sized plastic bag | 13 gal | large | 3 |
| `large_plastic_30gal` | Large plastic garbage bag | 30 gal | large | 3 |
| `large_paper_lawn_30gal` | Large brown paper lawn bag | 30 gal | large | 3 |
| `contractor_40_80gal` | Plastic landscaping/contractor bag | 40-80 gal | large | **4** (large's 3 + 1, per user's spec) |

Note this reclassifies `kitchen_13gal` from small→large vs. the first draft —
per user, the app's existing "large bag" (3pt) already effectively means a
kitchen-sized bag, and "small" is anything below that (bucket, grocery
bags). Contractor confirmed as large + 1 bonus point. The two 30-gal types
confirmed as `large` rollup at flat 3pt, same as the kitchen bag — no
volume-based premium below the explicit contractor tier.

Every type carries a `size_class` (`small` / `large`, two values only — this
is the legacy-rollup target, not a size label) so existing
`small_bags`/`large_bags` aggregation keeps working — see §3.

## 2. Countable small items (cigarettes + future types)

Confirmed: 1pt per 20 cigarettes (a pack), and **must be an adjustable game
setting**, not a hardcoded constant.

Since you asked "any other small trash items that could fit this category" —
rather than build a cigarette-only mechanism, this generalizes to a
**countable item types** lookup, same shape as `bag_types` (§4), with
cigarette butts as just the first seeded row. Candidate future rows,
un-seeded/inactive until you want them live: bottle caps, straws, vape
pods/cartridges, nip/mini liquor bottles, styrofoam pieces. All admin-editable
— adding a new one later is a data row, not a migration.

- `countable_item_types(key, label, unit_count, points_per_unit, active)`
- Cigarette butts seeded: `unit_count=20`, `points_per_unit=1`.

Value for a given item = `floor(count / unit_count) * points_per_unit`.

On team-event group competitions specifically ("who can pick up the most
cigarettes"): noted for later, out of scope for this pass per §3 — individual
self-log only for now. Revisit alongside
[[team-events-phase2-scoping-2026-08-29]] if/when a leaderboard needs to
rank by a specific countable item rather than total points.

## 3. Points-basis choice (per individual self-log)

Today: organizer `log-for-attendee` / `log-team-total` already choose bags
vs. pounds; individual self-log (`ContributionPanel.tsx`, `POST
/contributions/submit`) is bags-only. This extends the *individual* self-log
path to 4 bases:

1. **Small/large bag count** (today's default, unchanged) — no photo required.
2. **Granular bag type breakdown** — pick from the 7 types above, any mix, any count.
3. **Pounds** — already collected as a supplementary field today but not
   scored on this path (see `docs/game-engine-scoring-rules.md`'s "Pounds
   caveat"); this work makes it a selectable scoring basis here too, using
   the same `pound_value` (0.5) conversion organizer paths already use.
4. **Countable item** — pick an item type (cigarette butts for v1) + count, per §2.

**Anti-abuse rule (explicit from user):** photo required for any basis
*other than* default small/large bag count. Bases 2-4 all require ≥1 photo;
basis 1 keeps today's behavior (photo optional).

Organizer team-total/attendee paths are **out of scope for this pass** —
they stay bags-vs-pounds only. Granular type + cigarettes on a team total
would need per-attendee attribution design that doesn't exist yet; revisit
separately if wanted.

## 4. Data model

New JSONB column on `cleanups` (alongside existing `metrics_pounds`):

```sql
ALTER TABLE cleanups ADD COLUMN metrics_detail jsonb;
-- shape:
-- {
--   "basis": "bags" | "granular_bags" | "pounds" | "countable_item",
--   "bag_types": { "kitchen_13gal": 2, "contractor_40_80gal": 1 },
--   "countable_items": { "cigarette_butt": 45 }
-- }
```

Two new lookup tables (admin-editable, matches the "business approver"-style
admin surfaces already in the app rather than flat `game_settings` rows):

```sql
CREATE TABLE bag_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  size_class text NOT NULL CHECK (size_class IN ('small','large')),
  point_value numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE countable_item_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  unit_count int NOT NULL,
  points_per_unit numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
```

`bag_types.size_class` is the legacy-rollup target only (two values), not a
size label — `kitchen_13gal` and `contractor_40_80gal` both roll up as
`large` per §1/§3 below, at different `point_value`s.

Seeded directly in the migration via `INSERT ... ON CONFLICT DO NOTHING`,
matching the precedent in `068_admin_editable_milestone_ladders.sql` for
static admin-editable lookup rows — the Seeder registry
(`backend/app/services/seeders/`) is scoped to campaign/geo_unit
boundary-data seeding, not small static tables like these. Only cigarette
butts seeded `active=true` initially; the other candidate item types from §2
seed `active=false` so they exist in the admin UI to flip on later without a
migration.

**Backward compatibility:** when basis is `granular_bags`, `record_contribution`
still populates legacy `small_bags`/`large_bags` on the `contributions` row by
rolling each selected type up via its `size_class` (contractor rolls into
`large_bags` for legacy aggregation, with the +1/bag premium folded into
`value` directly rather than a separate column, per user's confirmation —
"we would still store this as a large bag and then the detailed json column
would have this as X contractor bags") — so every existing dashboard built
on `small_bags + large_bags` keeps working unchanged and un-migrated.
`metrics_detail` is the only new surface, purely additive.

Countable-item-only logs are the one case with no bag-count backward-compat
target — `small_bags`/`large_bags` both stay 0. Existing "bags collected"
tiles will under-count these; flagged for §6.

## 5. Scoring changes (`contribution_scoring.py`)

`record_contribution` currently computes `effective_value` from
`small_bags`/`large_bags` only. Extend to accept an optional `metrics_detail`
dict:

- `basis: "bags"` (or absent) → unchanged, today's `small_bags`/`large_bags` math.
- `basis: "granular_bags"` → sum `bag_types[key].count * bag_types_lookup[key].point_value`
  (lookup joined from the new `bag_types` table, not hardcoded — same
  admin-editability pattern as milestone ladders).
- `basis: "pounds"` → `pounds * settings.pound_value`, reusing the constant
  organizer paths already use.
- `basis: "countable_item"` → `floor(count / unit_count) * points_per_unit`,
  looked up from `countable_item_types` by key (§2).

Hotspot/bonus-spot/challenge multipliers apply identically regardless of
basis — no change to that part of `record_contribution`.

## 6. UI changes

**`ContributionPanel.tsx` (self-log form):** new basis-picker step ahead of
today's bag-count inputs — 4 options (§3), each revealing its own input
(bag-count grid, granular type picker w/ counts, pounds field, cigarette
count field), photo requirement enforced per §3 in `canSubmit`.

**Dashboards to update to surface the new detail** (additive, phased — not
all in one pass):
- Per-contribution feed/activity rows (`UserActivityList.tsx`,
  `FeedActivityList.tsx`) — show bag-type/cigarette detail on hover or
  inline when present, instead of just "3 bags."
- Group stats breakdown (`GroupStatBreakdownCharts.tsx`) — new chart or
  toggle for bag-type mix, alongside existing bag/pound charts.
- Campaign admin dashboard (`CampaignDashboardView.tsx`) and Leaderboard
  detail modal (`StatDetailModal.tsx` / `GeoStatsExplorer.tsx`) — same.
- User profile stats (`users/[username]/page.tsx`).
- Admin verification/moderation view — show raw `metrics_detail` for review
  context, since granular/pounds/cigarette entries are the ones requiring a
  photo (more likely to need spot-checking).

## 7. Suggested build phases

1. Migration (`bag_types` + `countable_item_types` tables + `cleanups.metrics_detail`
   + direct-INSERT seed rows). No user-facing change yet.
2. Scoring: extend `record_contribution` for the 4 bases (§5). Still no
   UI — testable via direct API calls.
3. `ContributionPanel.tsx` self-log basis picker + photo-requirement wiring.
4. Dashboard surfacing (§6) — likely its own follow-up pass given the
   number of call sites, not bundled into the same PR as #3.

## Resolved (2026-09-02)

1. Cigarette rate: 1pt/20, stored in `countable_item_types` (admin-editable
   via the standard game-settings-style admin UI, not a hardcoded constant).
2. Tier assignment: small = bucket + both grocery bag types; large = kitchen
   bag (3pt) and contractor (4pt). See §1.
3. Contractor bag rolls up as a legacy `large_bags` count; the discrete
   contractor count lives in `metrics_detail` alongside it. No separate
   bonus-credit row.
4. Scope stays individual self-log only for now; team/group countable-item
   competitions (e.g. "most cigarettes picked up") noted as a plausible
   future use of [[team-events-phase2-scoping-2026-08-29]], not built here.
   Countable items generalized beyond cigarettes (§2) in response to "any
   other small trash items" — lookup table instead of a cigarette-only
   mechanism, so new item types are a seed row, not a migration.

All open questions resolved as of 2026-09-02. Ready to build per §7.

## Related

- `docs/game-engine-scoring-rules.md` — points-per-action source of truth,
  needs a new row/section once this ships.
- `trash-war-feedback-backlog.md` (item 7.5), `project_trash_war_deferred`
  memory — original contractor-bag-tier ask this folds in.
- `master-backlog.md` — working-order item 1.
