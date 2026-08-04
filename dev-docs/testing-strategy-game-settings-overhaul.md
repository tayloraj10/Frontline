# Testing strategy — game_settings admin overhaul (migrations 056–057 + recompute fix)

Scope: cleanup-event grace/late-submission settings, admin settings page ordering/units/feet-meters, value tuning (hotspot_multiplier, trash_report_value), civic_action_value removal, and the recompute-all-balances bug fix.

Note: what were originally 6 migrations (056–061) were consolidated on 2026-08-03 into 2 files (`056_game_settings_cleanup_and_tuning.sql`, `057_game_settings_sort_order_and_descriptions.sql`) before anything was committed or deployed, so this section's numbering has shifted but the underlying DB end-state described below is unchanged.

## 1. Admin settings page (`/admin` → Settings tab)

- [ ] Load the page as an admin. Confirm no console errors, `settings.length > 0`.
- [ ] **Ordering**: "Claim timing" category shows all 3 claim-window severities consecutively, and "Check-in grace period - before" appears above "- after".
- [ ] **Trigger defaults** category shows Report-count threshold and Hotspot event duration first, then the score-threshold pair, then the time-elapsed pair.
- [ ] **civic_action_value row is gone** from the Points category.
- [ ] **Units**: spot-check each category —
  - claim_timing rows show `min`, except late-submission cutoff shows `hr`
  - triggers: the four duration/default-hours rows show `hr`; Report-count threshold and Score-threshold default show no unit (or `pts` for score-threshold — verify which you want, currently `pts`)
  - multipliers show `×`
  - points (bag/pound/report/solarpunk values) show `pts`
  - proximity rows show both `m` and `ft` fields
  - moderation (flag_auto_hide_threshold) shows no unit
- [ ] **Feet/meters sync**: on a proximity row, type a new feet value → meters field updates live (and vice versa). Save with a feet-derived value, reload the page, confirm the stored meters value is correct (spot-check the math: e.g. 500ft ≈ 152.4m).
- [ ] **Save flow**: edit a value, click Save, confirm "Saved ✓" flashes, value persists on reload. Try an invalid value (empty/non-numeric) and confirm it's rejected without saving.
- [ ] Confirm updated descriptions read correctly for: the four trigger-default settings, and trash_war_solarpunk_credit.

## 2. Cleanup event grace period + late submission (migration 056)

- [ ] Create a cleanup event with a scheduled start/end. Attempt check-in before `cleanup_event_grace_minutes_before` opens → rejected. Check in during the grace-before window → accepted.
- [ ] Check in after `cleanup_event_grace_minutes_after` has elapsed past the scheduled end → rejected (or flagged per existing behavior — confirm current expected behavior).
- [ ] Submit a cleanup-event contribution shortly after the event window closes (within 2 hours) → **not** flagged late.
- [ ] Submit one >2 hours after the window closes → flagged `is_late = true`, but submission still succeeds (never blocked).
- [ ] Submit a **group/team-total log** (not individually logged) more than 2 hours late → confirm it is NOT flagged late (per the documented scoping — team-total logs never populate `is_late`).
- [ ] Change `cleanup_event_late_submission_hours` in the admin page, confirm a new submission respects the updated value without a backend restart (reads live via `get_game_settings`).

## 3. Value tuning: hotspot_multiplier (→2) and trash_report_value (→0.5)

- [ ] Trigger a hotspot event (report-count threshold), submit a contribution inside the hotspot → confirm awarded points reflect the 2x multiplier vs. a non-hotspot contribution of the same base type.
- [ ] Submit a new trash report → confirm the report itself (not a cleanup) contributes 0.5 pts to the reporter's lifetime points, not 1.
- [ ] Confirm a small-bag cleanup (1 pt) is still worth more than a trash report (0.5 pts) in the UI/points history, matching the intent ("less significant than cleaning a small bag").

## 4. civic_action_value removal

- [ ] Confirm the "Road to Independence" campaign is still `draft` (unaffected by removal) — no user-facing regression expected since it's not live.
- [ ] If any code path calls `record_contribution` or `/contributions/process` with `contribution_type` outside `cleanup` and no explicit `value`, confirm it still falls back to the hardcoded default (1) without erroring, since the game_settings row no longer exists.
- [ ] Grep-confirm no frontend code reads `civic_action_value` from the settings cache expecting it to exist (would silently fall back to `undefined`/NaN if so — check `ContributionPanel.tsx` and anywhere else consuming `useGameSettings`-style hooks).

## 5. Recompute-all-balances bug fix (critical — verify before running in prod)

- [ ] Run `GET /admin/points/recompute-impact` (preview) locally. Confirm it now lists users whose stored points differ from a from-scratch resum that correctly weights trash reports at current `trash_report_value` (already spot-verified: `amandaleigheli` and `bushwicktrashlady` show diffs).
- [ ] Confirm `spendable_points` in the preview also reflects the same report weighting (check the `FILTER (WHERE ca.counts_toward_spendable_points)` branch, not just lifetime).
- [ ] Run `POST /admin/points/recompute` (apply) locally. Confirm:
  - the two flagged users' `points`/`spendable_points` update to the previewed values
  - each receives a `user_notifications` row (`points_adjusted`) with correct before→after text
  - users with NO discrepancy are untouched (no spurious notification)
- [ ] Re-run the preview immediately after applying → should return an empty user list (fully converged).
- [ ] Regression-check the single-user endpoint `POST /admin/users/{id}/recompute-points` still matches the bulk math for the same user (both should now agree, since both correctly apply `trash_report_value`).
- [ ] **Bind-param type-truncation regression check**: confirm `amandaleigheli` previews to exactly `0.5` (not `0`) and `bushwicktrashlady` to exactly `30.5` (not `23.5`). A prior version of this fix multiplied `COUNT(*) * :trash_report_value` without a numeric cast — asyncpg/Postgres inferred the bind param's type from `COUNT(*)` (bigint) and silently truncated `0.5` to `0` before the multiply. Fixed via `COUNT(*) * CAST(:trash_report_value AS numeric)`. If any future `game_settings`-driven multiplier gets added to raw SQL, it needs the same explicit cast or it will silently floor fractional settings values to 0/1.
- [ ] **Restart the local backend before testing this section.** The stale-code confusion this session traced back to a leftover backend process serving code from before `admin_prod.py` existed — always fully stop/relaunch the local FastAPI dev server after pulling or editing backend routes before trusting recompute numbers.

## 5b. Campaign spendable-points-toggle preview (`preview_campaign_spendable_points_impact`, admin.py:664)

A second, separate code path with the exact same bug: it previews the impact of flipping a single campaign's `counts_toward_spendable_points` flag, and had its own hand-rolled report-count subquery that never multiplied by `trash_report_value` at all (flat `COUNT(*)`), and was missed by the earlier fix since it's not part of `_POINTS_RECOMPUTE_TOTALS_CTE`.

- [ ] `GET /admin/campaigns/{trash-war-id}/spendable-points-impact?enabled=true` (Trash War is already enabled, so this is a no-op toggle) — confirm `amandaleigheli` (1 report, no contributions) previews `current_spendable_points: 1.0` → `new_spendable_points: 0.5`, not `1.0`.
- [ ] `?enabled=false` — confirm she previews to `0.0` (correct: disabling the campaign excludes the report entirely, regardless of its point value — this is not the same bug and should NOT show `0.5`).
- [ ] Same numeric-cast regression as 5's bullet 3: confirm the value is exactly `0.5`, not truncated to `0` — verify the SQL uses `COUNT(*) * CAST(:trash_report_value AS numeric)`.
- [ ] Confirm this preview endpoint's numbers now agree with the general recompute-impact preview for any user who only has reports in the one campaign being toggled.

## 6. Migration/tracking sanity (only relevant once, before this branch merges)

- [ ] Confirm `supabase_migrations.schema_migrations` locally has entries through 057, and no stale rows for the old 058–061 versions (done — verified/corrected this session after consolidating 6 migrations down to 2).
- [ ] Before applying to prod: run `supabase db push` (or your normal deploy path) rather than raw `psql`, so prod's tracking table stays in sync — avoid repeating the local drift that was just corrected.
- [ ] After prod deploy, immediately run the prod recompute-impact preview (read-only) to see the real-world blast radius of `trash_report_value` changing from 1→0.5 for every existing trash-report submitter before deciding whether/when to apply the bulk recompute in prod (this changes real users' visible points — consider whether you want to announce it, since scores will visibly drop for anyone who's submitted reports).

## 7. Admin UI limitation notices (Part B decision, 2026-08-03)

- [ ] Settings tab: open the "Points" and "Multipliers" categories, confirm the amber notice is visible explaining that changes there only affect new submissions and aren't covered by recompute (except trash report value).
- [ ] "Recompute all balances" modal: confirm the amber notice under the summary line explains the same scope limitation before showing the affected-users table.

## Out of scope / explicitly not covered by this pass
- Hex Bloom stage thresholds and World Bloom milestones (still hardcoded arrays, deferred per earlier decision).
- Territory-capture layer changes (unrelated, separately deprioritized).
- **Recalibrating points when `small_bag_value`/`large_bag_value`/`pound_value`/`hotspot_multiplier`/`claim_challenge_multiplier` change.** Unlike `trash_report_value` (computed live as `COUNT(*) * current_rate`, so both recompute paths pick up a new rate retroactively for free), cleanup contribution points are baked into `contributions.value` at submission time using whatever rate was active then — changing the setting later does not change existing rows, and neither recompute function re-derives `value` from the underlying `cleanups.metrics_small_bags`/`metrics_large_bags`/`metrics_pounds`. This is dev-backlog #8 Part B — **decided against 2026-08-03**: too big/risky an overhaul, and there's no safe or clearly-correct way to rewrite history for a metric like small-bag value after the fact. Mitigated instead by the admin UI notices added in section 7 above. Do not build this without the user explicitly reopening it.
