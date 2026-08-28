# Random Bonus Spots — Scoping — 2026-08-26

**Status: scoping only, nothing built.**

## The idea

Add a game-y layer where the app periodically surfaces "bonus spots" — specific locations worth extra points if someone cleans up there — instead of the current model where every score bonus (hotspot, claim-challenge) is *reactive* (triggered by existing reports/activity) rather than *placed*. The two hard constraints called out up front:

1. Can't be placed somewhere inaccessible (private property, water, a highway median, etc.).
2. Shouldn't be placed somewhere with no actual trash, or the game element becomes "go stand in a random spot and find nothing," which undermines the app's real purpose.

Both constraints point toward the same answer explored below: **don't generate spots from scratch — pick them from existing trash-relevant data the app already has**, rather than picking arbitrary lat/lngs and hoping they're valid.

## What already exists that this should be built from

- **`problem_reports`** (`002_event_system.sql`) — user-submitted trash reports with a `GEOGRAPHY(POINT, 4326) location`, `severity` (`low`/`medium`/`high`), and `status` (`open`/`addressed`/`verified`). This is exactly "where existing trash reports say there's trash" — an unaddressed, ideally `verified` or at least `open` report with `high`/`medium` severity is a far better bonus-spot candidate than a random point, because a real person already looked at that spot and said "there's trash here."
- **Hotspot/multiplier pattern** (`contribution_scoring.py`, `effect_config->>'type' = 'score_multiplier'`, matched against `geo_unit_id`) — the existing scoring mechanism already knows how to apply a bonus multiplier tied to a geographic scope and expiring on a timer. A bonus spot is naturally another row in whatever table backs this (or a sibling `campaign_events` row per `002_event_system.sql`'s `event_type` pattern, e.g. a new `event_type = 'bonus_spot'`), except scoped to a **point + small radius** instead of a whole `geo_unit_id`. This is closer to the proximity-based matching already proposed for the business-proximity bonus (`[[business-proximity-cleanup-bonus-scoping-2026-08-14]]`, `ST_DWithin` against a point) than to the geo_unit-keyed hotspot — recommend reusing that spatial-predicate variant rather than the geo_unit one.
- **No existing "accessible area" dataset** — confirmed via search: no parcel data, no public-land/park boundary layer, no sidewalk/right-of-way data, no reverse-geocoding integration anywhere in the backend today. This is the real gap. "Base it on trash reports" solves the *has-trash* half of the accessibility problem for free (a report only exists because someone stood there and photographed it — see caveat below), but doesn't by itself guarantee the spot is legally/physically accessible right now (a report from months ago could be on land that's since been fenced off, under construction, etc.).

## Two ways to solve "accessible + has trash" without new geodata

### Option A — Spots are drawn only from existing `problem_reports`
A bonus spot *is* an existing problem report (or cluster of them), promoted with a multiplier and a time window, rather than a synthetic point. Since a report's location came from a real person standing there with a camera, it inherits a strong (not perfect) accessibility guarantee for free — no new dataset needed.
- **Trash guarantee:** strong — someone verified this specific spot recently.
- **Accessibility guarantee:** decent but not certain — the report's location was accessible *when reported*; staleness is the risk (recommend only drawing from reports newer than some threshold, e.g. last 30 days, and/or `status != 'addressed'` so an already-cleaned spot doesn't get re-promoted).
- **Downside:** bonus spots are limited to wherever reports already exist — sparse in areas with low report volume, and it doesn't add "explore a new corner of the map" the way a more open-ended random-placement feature might.
- **Smallest lift of the two options** — no new geodata integration, just a selection + promotion job over data that already exists.

### Option B — Randomized within a constrained accessible area, cross-checked against trash-report density
Pick a genuinely random point, but constrained to a pre-approved accessible polygon (e.g. only inside street rights-of-way / park boundaries from a public dataset), then only promote it if it's within some radius of a recent `problem_reports` cluster (reusing Option A's trash signal as a *filter* rather than the *source*).
- **Trash guarantee:** same strength as A if the density filter is required, weaker if it's optional.
- **Accessibility guarantee:** stronger than A in principle, but requires a new accessible-area dataset — e.g. NYC Open Data has parks/public-space polygons and street centerline data that could be pulled in, but that's new ETL, storage, and a new spatial join, not a small add.
- **Downside:** meaningfully bigger build — new dataset ingestion + maintenance (open data updates over time), plus still needs the report-density filter to avoid "accessible but nothing there."

**Recommendation: start with Option A.** It reuses 100% existing data, ships without any new geodata pipeline, and directly channels player attention onto real reported trash — which is a better outcome for the app's actual mission than a purely game-y random-walk feature would be. Option B is a natural v2 once there's a reason to want bonus spots in areas with no existing reports (e.g. if report density turns out too sparse for A to feel "random" enough).

## How it would work under Option A (rough shape)

1. A backend job (cron or triggered) periodically selects N `problem_reports` matching: `status IN ('open','verified')`, `severity IN ('medium','high')`, `reported_at` within a recency window, not already an active bonus spot, spatial diversity (don't pick 5 reports on the same block — some minimum distance between simultaneously-active spots).
2. Promote each selected report to a bonus-spot event: point + radius (e.g. 50-100m), multiplier value, expiry (e.g. active for a few hours to a day — short enough to feel like a "spawn," per the game-element goal).
3. `contribution_scoring.py` gains a spatial-predicate lookup (same shape as the hotspot lookup, `ST_DWithin` against the bonus spot's point instead of `geo_unit_id` equality) and folds into the existing take-the-max multiplier stacking rule alongside hotspot and claim-challenge.
4. Map/UI: bonus spots need to actually be visible before someone can chase them — a new marker/pin type on the map (distinct from a problem-report pin and a hotspot indicator), probably with a countdown to expiry to reinforce the "spawn" framing.
5. When someone logs a contribution at a bonus spot's location, does it also resolve the underlying `problem_report` (mark it `addressed`, same as the existing `resolved_by_cleanup_id` link on `cleanups`)? Recommend yes — this closes the loop cleanly (the bonus spot existed *because* a report was open, and clearing it both scores the bonus and resolves the report it was drawn from) and gives the feature a real cleanup outcome, not just a points payout.

## Open questions

1. **Selection cadence and count** — how often do new bonus spots spawn, and how many active at once (per city? per campaign/zip)? Too many dilutes the "special" feeling; too few and most players never encounter one.
2. **Multiplier value and duration** — reuse the existing hotspot multiplier setting, or a distinct (likely higher, to feel more "jackpot") value with its own expiry window?
3. **Report reuse** — does spending a bonus-spot report's location resolve the underlying `problem_reports` row, or are these tracked independently? Recommended above to link them, but worth confirming that doesn't create confusing UX if a report is *also* independently addressed by someone else mid-window.
4. **Selection bias risk** — if the bonus-spot algorithm keeps drawing from a handful of chronically high-report neighborhoods, does that skew engagement away from other areas of the map in a way that fights the game's territory/exploration goals? Worth a spatial-diversity rule (spread spots across zips/geo_units) rather than pure severity-ranked selection.
5. **Option B revisit trigger** — what report-density threshold would signal "Option A is too sparse, worth investing in the accessible-area dataset for Option B"? Not worth answering now, but worth deciding what to measure once Option A ships so this isn't a subjective call later.
6. **Anti-fraud** — same standing gap referenced in `[[payments-scoping-2026-08-20]]` and the business-proximity doc: contribution logging is client-trusted today, no server-side proximity check. A bonus-spot multiplier is exploitable the same way hotspot/proximity bonuses are (claim the bonus without actually being there) — not a blocker for a points-only feature the way it would be for real money, but worth the same "does this need rate-limiting" consideration the other multiplier features already carry.

## Suggested build order

1. Ship Option A: report-selection job + spatial-predicate scoring hook (reuses `contribution_scoring.py`'s existing multiplier-stacking pattern) + a bonus-spot map marker.
2. Link bonus-spot resolution back to the source `problem_report`'s status.
3. Watch report density / spot availability in practice; only invest in Option B's accessible-area dataset if Option A proves too sparse to sustain the "random spawn" feel.
