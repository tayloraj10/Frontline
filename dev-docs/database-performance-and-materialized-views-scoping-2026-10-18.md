# Database performance and materialized views (2026-10-18)

Status: **scoped, not started**. Nothing below is implemented, and no query has been run or timed. Everything comes from reading the code. Step 1 (measure with `EXPLAIN ANALYZE`) comes before any migration.

Related: `native-app-load-time-scoping-2026-10-18.md` (the frontend side of the same slowness), `security-lockdown-and-staging-2026-10-17.md` (staging is the right place to test these against realistic data), `leaderboard.py` and `tiles.py` under `backend/app/api/routes/`.

Rules that apply: prod is live, so migrations are written by us and **applied to prod by the user only**. Local migrations can be applied without asking. No `supabase db reset`.

## 1. Where we are today

- There are no materialized views and no summary tables. Migrations are `001` to `107` plus branch work.
- Existing indexes (migration 009 and later) are mostly single-column: `contributions(campaign_id)`, `(user_id)`, `(submitted_at)`, partial indexes on `cleanup_event_id` and `team_event_id`, and GIST on `location`. Whether composite indexes exist for the queries below was not verified.
- `contributions` is the table that grows without bound, and every leaderboard and stats endpoint aggregates over it live on each call.
- Next.js wraps some of these in a 20s `unstable_cache`, which bounds server-rendered traffic. Client-side calls (`EntityLeaderboardTabs`, `GeoStatsExplorer`) hit Postgres directly.
- Points are already maintained incrementally by triggers (`sync_profile_points`), so the trigger pattern is established in this codebase.

## 2. Query inventory (what scans `contributions`)

| Query | Location | Pattern | Grows with |
|---|---|---|---|
| Top active streaks | `leaderboard.py` `/leaderboard/streaks` | `SELECT DISTINCT user_id, week` over all cleanup contributions, window function, `GROUP BY` | all cleanup contributions, ever |
| Campaign leaderboard | `/{cid}/leaderboard` | `SUM`, `COUNT DISTINCT user/group`, `GROUP BY user`, `GROUP BY group`, plus bag totals through a `cleanups` join | contributions per campaign |
| Global leaderboard | `/leaderboard/global` | `GROUP BY user` and `GROUP BY group` over all contributions, with a time window | all contributions |
| Range leaderboard | `/{cid}/leaderboard/range` | same as campaign, with `submitted_at` window | contributions per campaign |
| Geo stats | `/{cid}/geo-stats` | several branches joining `geo_units` to `contributions` with `ST_Contains`, `GROUP BY unit` | contributions times geo units, the heaviest |
| Geo stats trend | `/{cid}/geo-stats/trend` | `date_trunc` bucket and `SUM` | contributions per campaign |
| Campaign page and Leaderboard page bag totals | `campaigns/[slug]/page.tsx`, `leaderboard/page.tsx` | pulls **every** `cleanups` row and sums in JavaScript | cleanups per campaign |
| Campaign page claims | same | `territory_claims select *` for the campaign | claims per campaign |
| Dashboard | `campaign_dashboard.py` (overview, breakdown, trend, partners) | aggregates, not reviewed in detail | contributions |

## 3. Candidates, in priority order

### A. Streak weeks (best first candidate)

A materialized view `user_cleanup_weeks(user_id, week)` holding the distinct pairs, with a unique index on `(user_id, week)`. The streak query then runs over a table that is orders of magnitude smaller. Refresh concurrently every 5 to 15 minutes. The profile page's own streak calculation could read it too. Staleness of a few minutes is invisible here.

An alternative to a scheduled refresh: a trigger that inserts the `(user_id, week)` row when a cleanup contribution is inserted. This is always live and cheap (insert-only, `ON CONFLICT DO NOTHING`), but must also handle deletes and backfill. Decide in step 2.

### B. Per-campaign summary (`campaign_stats`)

One row per campaign: total value, contribution count, unique contributors, unique groups, small bags, large bags, pounds. Replaces the JavaScript sums and the first query in `/leaderboard`. Could be a materialized view or a trigger-maintained table. Distinct counts are awkward to maintain incrementally, so a materialized view is simpler.

### C. Leaderboard totals

`campaign_user_totals(campaign_id, user_id, total_value, contribution_count, small_bags, large_bags, pounds)` and the group equivalent, with unique indexes and `ORDER BY total_value DESC` indexes. Covers the all-time leaderboard and the global leaderboard. Time-windowed variants (today, week, month) are harder: either keep them live (with a good composite index on `(campaign_id, submitted_at)`) or add daily rollups.

### D. Daily rollup for geo stats and trend

`geo_daily_stats(campaign_id, geo_unit_id, day, total_value, contribution_count, ...)`. Removes the runtime `ST_Contains` join and serves geo-stats and trend for every window by summing day rows. **First check whether `contributions` already stores `geo_unit_id`** (migration 001 has a `geo_unit_id` column on at least one of the core tables, line 74, not confirmed to be `contributions`). If it does, the spatial join may not be needed at all and an index might be enough. Distinct contributor counts do not add across days, so those need separate handling or an approximation.

### Keep live (do not materialize)

Recent activity feed, the campaign map claims and problem reports, notifications, anything a user expects to update the moment they act. Realtime subscriptions already cover some of these.

## 4. Plan

### Step 1: measure (no migrations)

- Restore or seed a prod-sized dataset locally or on staging. Seeding must go through the Seeder registry and `POST /admin/seed`, per the project rule.
- Run `EXPLAIN (ANALYZE, BUFFERS)` on each query in section 2 and record plan, time and buffers here. Capture current row counts for `contributions`, `cleanups`, `geo_units`, `territory_claims`.
- Look at Supabase's Query Performance report and `pg_stat_statements` on prod (read-only, in the dashboard) for the real top queries by total time and by calls. This tells us what actually costs money today.
- Decide the threshold: only materialize what is slow now or will clearly be slow at 10x current data.

### Step 2: indexes first (cheap, fully live)

- Add composite indexes the plans call for. Likely: `contributions(campaign_id, submitted_at DESC)`, `contributions(campaign_id, user_id)`, `contributions(user_id, submitted_at)` filtered to cleanup types for streaks, and a `(group_id)` equivalent.
- Use `CREATE INDEX CONCURRENTLY` for prod to avoid locking writes. Migration tooling that wraps migrations in a transaction cannot run it, so check how Supabase migrations are applied here before writing it.
- Re-run `EXPLAIN` and keep only the indexes that helped. Each index slows inserts and costs storage.

### Step 3: materialized views, in order A, B, C, D

For each:
- Migration creating the view and a **unique index** (required for `REFRESH MATERIALIZED VIEW CONCURRENTLY`).
- Refresh job: a Railway cron in `.railway/railway.ts` (apply with `railway.exe config plan` then `config apply --yes`) calling a protected backend endpoint, or `pg_cron` inside Supabase. `pg_cron` avoids a new HTTP endpoint and an auth question (the cron endpoints are currently public, see the security doc). Pick one approach for all views.
- Change the endpoint or page to read from the view. Keep the old query behind a flag for a release so it can be reverted without a migration.
- Add the view to the seeding and recompute path: after `POST /admin/seed` or a recompute, refresh the views, or local data will look empty.

### Step 4: stop pulling rows into JavaScript

Independent of materialized views and can ship first: replace the `cleanups` and `territory_claims` full-row pulls on the campaign and leaderboard pages with a single aggregate (or the `campaign_stats` view once it exists).

## 5. Risks and caveats

- **Staleness.** A materialized view is only as fresh as its last refresh. Leaderboards that lag by a few minutes are fine. Anything tied to a user's own action (their points, their just-logged cleanup) must not read from a stale view. The user's own total already lives on `profiles.points`.
- **Refresh cost.** A refresh recomputes the whole view. It pays off only when reads are far more frequent than refreshes. If a view takes long to refresh, move it to a trigger or incremental table.
- **Locks.** A non-concurrent refresh blocks reads. Always `CONCURRENTLY`, which needs the unique index and is slower.
- **RLS and exposure.** Materialized views do not enforce RLS. If the Supabase client could read them through the API they could leak data, so put them where PostgREST does not expose them, or revoke access from `anon` and `authenticated` and read them only through FastAPI. Check how the current schemas are exposed before creating anything.
- **Schema split.** The dev/public schema split is an open backlog item (`project_schema_split_todo`). New views must follow whatever schema the tables live in today, and not add to that debt.
- **Correctness.** The bag totals logic dedupes `cleanup_id` / `cleanup_event_id` so a team-split event is not multiplied by attendee count (see the comment in `leaderboard.py`). Any view must reproduce that exactly. Compare view output against the live query on the same data before cutting over.
- **Prod migrations are the user's job.** Each migration is handed over with a note on lock behavior and expected duration.

## 6. Open questions

1. Is `pg_cron` enabled on the Supabase project, and is it preferable to a Railway cron for refreshes?
2. What are today's row counts and the slowest queries in the Supabase performance report? This sets how urgent each item is.
3. How stale is acceptable for each leaderboard (1 minute, 5, 15)?
4. Does `contributions` store `geo_unit_id`, and is it reliably filled for old rows?
5. Do the time-windowed leaderboards (today, week, month) matter enough to roll up, or are indexes enough?

## 7. Done criteria

- Plans and timings recorded before and after each change.
- Each view's output matches the live query on the same dataset.
- Refresh runs on schedule in prod and a failed refresh is visible (Sentry or logs).
- Migrations handed to the user with apply notes, none applied to prod by Claude.
