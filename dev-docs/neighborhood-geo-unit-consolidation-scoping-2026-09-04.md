# Neighborhood Geo Unit Consolidation Scoping (2026-09-04)

Triggered by investigating why the campaign map's neighborhood "Recent Activity" panel shows no data (root cause: `geo_units.py`'s `/geo-units/{id}/stats` filters by exact `contributions.geo_unit_id` equality, but neighborhoods are decorative overlays never assigned to contributions directly — see section 1). That bug plus the admin Geofence Picker's one-dropdown-entry-per-city pattern raised the bigger question: collapse `nyc_neighborhood` / `la_neighborhood` / `chicago_neighborhood` / `philadelphia_neighborhood` into one general `neighborhood` unit_type, with each neighborhood linked to its parent `city` geo_unit. Covers: the immediate stats bug, full audit of every user-facing surface and data dashboard touched, schema design (incl. the parent-city FK), and a proposed build order. `nyc_borough` is addressed as an explicit in/out-of-scope decision, not silently folded in.

## 1. The immediate bug (independent of consolidation)

`get_geo_unit_stats` in `geo_units.py` (lines 118-210) computes `total_points`, `recent_contributions`, and `cleanups`/bag totals via `contributions.geo_unit_id = :geo_unit_id` / `cleanups.geo_unit_id = :geo_unit_id` — exact FK equality. But `contributions.geo_unit_id` is always resolved at submission time to one of the campaign's *configured* `geo_unit` types (`zip`, `h3_hex`, `state`, etc. — see `campaigns.geo_unit`), never to a neighborhood/borough, since those are decorative overlays computed after the fact. So these three fields are always empty/zero for any neighborhood or `nyc_borough` unit, on every campaign, in every environment — not a time-filter bug, not month-specific.

The same file's `report_row` query (lines 172-183) already does this correctly: `JOIN geo_units t ON t.id = :geo_unit_id WHERE ... ST_Contains(t.geometry, r.location::geometry)`. `leaderboard.py`'s `/geo-stats` endpoint documents and uses the identical spatial-join pattern for its neighborhood/borough levels. This is a pre-existing established pattern being fixed in one place.

### Decisions from discussion

- Fix is mechanical: rewrite `total_points`, `recent`, and `cleanups` in `get_geo_unit_stats` to join via `ST_Contains(geo_units.geometry, contributions.location::geometry)` / `...cleanups.location::geometry`, matching `report_row` and `leaderboard.py`. Route-only submissions with no point (already excluded from `leaderboard.py`'s neighborhood aggregation per its own docstring) get excluded the same way here for consistency.
- This bug fix is **independent of the consolidation** below — worth landing on its own regardless of whether/when the bigger unit_type collapse happens, since it's a one-file, low-risk change. Sequencing decision is in the build order.

## 2. Full audit: every surface touched by the four neighborhood unit_types

Grepped every reference to `nyc_neighborhood` / `la_neighborhood` / `chicago_neighborhood` / `philadelphia_neighborhood` (and `nyc_borough`, structurally identical) across backend and frontend. Nothing found beyond what's listed here.

### Backend

- **`geo_units.py`** — `/geo-units/{id}/stats` (bug above), otherwise unit_type-agnostic (bbox, boundary, zip/UK centroid routes don't need changes).
- **`leaderboard.py`** — module constant `_GEO_STATS_LEVEL_UNIT_TYPES = {"neighborhood": "nyc_neighborhood", "borough": "nyc_borough"}` (line 17), consumed by `/geo-stats`'s `children_level` branch (lines 606-668) to decide which `geo_units.unit_type` to aggregate into when a caller asks to drill into `"neighborhood"` or `"borough"`. **Hardcoded to NYC** — there is no way today to ask this endpoint for Chicago's or LA's neighborhood breakdown; the level name is a fixed string, not parameterized by focus unit's city.
- **`tiles.py`** — four near-identical adjacency endpoints (`/nyc-neighborhoods/adjacency`, `/philadelphia-neighborhoods/adjacency`, `/chicago-neighborhoods/adjacency`, `/la-neighborhoods/adjacency`, each ~25 lines, only the `unit_type` string literal differs) and four near-identical MVT tile endpoints (`/nyc-neighborhoods/{z}/{x}/{y}.mvt`, `/philadelphia-neighborhoods/...`, `/chicago-neighborhoods/...`, `/la-neighborhoods/...`, each ~60 lines, only the `unit_type` filter and the `ST_AsMVT(..., '<city>_neighborhoods', ...)` source-layer name differ). Plus `_TILE_CACHE_PREFIX_BY_UNIT_TYPE`, `reset_tile_cache`/`reset_adjacency_cache` (both have per-unit_type `if/elif` chains), and `_SIMPLIFY_TOLERANCE_BY_UNIT_TYPE` (one entry per city, identical `0.0001` tolerance for all four). Also `/cities/{z}/{x}/{y}.mvt`, which already serves the 4 `unit_type='city'` rows generically — this is the pattern to replicate for the consolidated neighborhoods layer.
- **`admin.py`** — four near-identical `simplify_<city>_neighborhoods` POST endpoints (`/simplify-nyc-neighborhoods`, `/simplify-philadelphia-neighborhoods`, `/simplify-chicago-neighborhoods`, `/simplify-la-neighborhoods`), each pointing at a differently-named raw/simplified GeoJSON file pair and calling a differently-named `geo.py` function.
- **`geo.py`** — the four `simplify_<city>_neighborhoods` functions themselves plus their `..._raw.geojson` / `...neighborhoods.geojson` file-path constants (called by the admin endpoints above).
- **`seeders/`** — four seeders (`nyc_neighborhoods.py`, `la_neighborhoods.py`, `chicago_neighborhoods.py`, `philadelphia_neighborhoods.py`), each near-identical: reads its city's simplified GeoJSON, `INSERT ... ON CONFLICT (unit_type, unit_id) DO UPDATE` with a hardcoded `unit_type` literal, then a same-city `ST_DWithin`/`ST_Intersects` self-join to populate `geo_unit_adjacency` scoped to `WHERE unit_type = '<city>_neighborhood'`. `cities.py` (`CitySeeder`) already seeds the 4 `unit_type='city'` rows this design would parent neighborhoods to. `seeders/__init__.py` registers all of these plus the `GeoUnitType` enum (also used by `tiles.py`'s `_SIMPLIFY_TOLERANCE_BY_UNIT_TYPE`).
- **`contributions.py`** — confirmed (prior read) that `geo_unit_id` resolution never touches neighborhood/borough types; no changes needed here regardless of consolidation.
- **`nyc_boroughs.py` seeder**, `_TILE_CACHE_PREFIX_BY_UNIT_TYPE["nyc_borough"]`, `/nyc-boroughs/{z}/{x}/{y}.mvt`, `/nyc-boroughs/adjacency` — structurally the same "decorative overlay, single city" pattern as neighborhoods, but currently dormant/non-functional in prod (see [[project_nyc_borough_outline_deferred]]). Scope decision below.

### Frontend

- **`CampaignMap.tsx`** — largest surface. Per-city hardcoded `"source-layer"` references at lines 2958-3008 (`nyc_neighborhoods`), 3045-3061 (`nyc_boroughs`, gated behind a comment noting the borough layer is deferred — line 3018), 3156-3172 (`philadelphia_neighborhoods`), 3215-3231 (`chicago_neighborhoods`), 3274-3290 (`la_neighborhoods`) — each block wires a MapLibre source + fill/outline layer pair for that city's neighborhoods. A second hardcoded map at lines 4812-4823 (`{"nyc-neighborhoods-stats-fill": {...}, ...}`) wires the *stats* (choropleth click) variant of the same layers, one entry per city, again including the still-deferred borough pair. This is the component whose neighborhood click handler feeds the Recent Activity panel that started this investigation.
- **`GeofencePicker.tsx`** (admin team-events) — `UNIT_TYPE_OPTIONS` (lines 24-41) is a flat array with one `{value, label, sourceLayer, route}` entry per city (`nyc_neighborhood`/`philadelphia_neighborhood`/`chicago_neighborhood`/`la_neighborhood`, plus `nyc_borough` and `city`). Clearest evidence for consolidating: every new city requires a new hardcoded dropdown entry here.
- **`GeoStatsExplorer.tsx`** (Leaderboard "Geo Stats explorer" dashboard) and **`GroupGeoStatsExplorer.tsx`** (Group Stats admin "Deep Dive" dashboard) — both define an identical `levelsBelow(unitType)` (lines 113-124 / 61-66) that only returns non-empty drill-down levels for `unitType === null` (root) or `"nyc_borough"` / `"nyc_neighborhood"`. **Any non-NYC campaign focus unit gets `[]` — no neighborhood/borough breakdown at all today**, not a display bug so much as a feature gap this consolidation is a natural opportunity to close.
- **`GeoStatsMap.tsx`** (shared renderer used by both explorers above) and **`GroupStatsView.tsx`** (Group Stats page's Map Snapshot share-card export) — both independently define the identical `LEVEL_TILE_INFO` map (`borough`/`neighborhood`/`zip` → `{path, sourceLayer}`), hardcoded to the NYC tile routes (`nyc-boroughs`, `nyc-neighborhoods`). `GroupStatsView.tsx`'s copy additionally feeds the downloadable/shareable Map Snapshot PNG/JPEG export — a third independent consumer of the same NYC-only assumption, and the one place this isn't just a dashboard but an artifact users download and share externally.

### Summary table

| Surface | Kind | NYC-only today? |
|---|---|---|
| Campaign map neighborhood click → stats panel | user-facing | No (all 4 cities wired, but stats panel is broken per §1) |
| Geofence Picker (admin team-events) | admin user-facing | No (all 4 cities wired, but 1 dropdown row per city) |
| Leaderboard Geo Stats explorer | data dashboard | **Yes** — non-NYC campaigns get no neighborhood/borough drill-down |
| Group Stats admin Deep Dive explorer | data dashboard | **Yes** — same gap |
| Group Stats Map Snapshot share card | user-facing export | **Yes** — same gap |
| Tile/adjacency endpoints | backend infra | No (all 4 cities wired, 8 near-duplicate endpoints) |
| Admin simplify/reload endpoints | admin tooling | No (all 4 cities wired, 4 near-duplicate endpoints) |

## 3. Schema design

### Decisions from discussion

- Collapse `nyc_neighborhood` / `la_neighborhood` / `chicago_neighborhood` / `philadelphia_neighborhood` into a single `unit_type = 'neighborhood'`.
- Add a self-referencing `geo_units.parent_geo_unit_id UUID REFERENCES geo_units(id)` column. Every consolidated neighborhood row gets this set to its city's `unit_type='city'` row (the 4 rows `cities.py` already seeds). This does two things at once, per the user's request: (a) gives "which city is this neighborhood in" a real FK instead of an implicit unit_type-string prefix, and (b) lets any code that currently branches on `unit_type IN ('nyc_neighborhood', 'la_neighborhood', ...)` instead branch on `unit_type = 'neighborhood' AND parent_geo_unit_id = :city_id` (or just `unit_type = 'neighborhood'` when it doesn't care which city).
- `unit_id` values are currently just neighborhood names/slugs per city (e.g. `"bushwick-west"`), scoped uniquely by `(unit_type, unit_id)`. Once `unit_type` is shared across all 4 cities, `unit_id` collisions become possible in theory (two cities both having a neighborhood literally named the same slug) — checked seed data, no actual collisions today, but the unique constraint should move to `(unit_type, unit_id, parent_geo_unit_id)` to be safe going forward, or `unit_id` should be prefixed per-city (e.g. `"nyc:bushwick-west"`) to keep a plain `(unit_type, unit_id)` uniqueness. Leaning toward the compound constraint since it's less invasive to existing `unit_id` values that other code may already reference by their current (unprefixed) string.
- `nyc_borough` **stays out of scope for this pass** — it's non-functional in prod today ([[project_nyc_borough_outline_deferred]]) and structurally identical work; folding it in now would double the migration/endpoint surface for a layer nobody can use yet. Revisit once borough data is actually loaded in prod.
- Existing FK references from `contributions`, `cleanups`, `problem_reports`, `territory_claims`, `campaign_events`, `campaign_event_geo_units`, and `geo_unit_adjacency` all point at `geo_units.id` (uuid), not the `unit_type` string — since seeders use `ON CONFLICT (unit_type, unit_id) DO UPDATE`, ids are stable across reseeds, so a migration that rewrites `unit_type` values in place (rather than deleting/reinserting rows) preserves every existing FK with zero data loss or backfill needed on the referencing tables.

### Schema sketch

```sql
-- Migration outline
ALTER TABLE geo_units ADD COLUMN parent_geo_unit_id UUID REFERENCES geo_units(id);

-- Backfill: point every existing neighborhood row at its city row
UPDATE geo_units n
SET parent_geo_unit_id = c.id
FROM geo_units c
WHERE c.unit_type = 'city'
  AND n.unit_type IN ('nyc_neighborhood', 'la_neighborhood', 'chicago_neighborhood', 'philadelphia_neighborhood')
  AND c.unit_id = CASE n.unit_type
      WHEN 'nyc_neighborhood' THEN 'nyc'
      WHEN 'la_neighborhood' THEN 'la'
      WHEN 'chicago_neighborhood' THEN 'chicago'
      WHEN 'philadelphia_neighborhood' THEN 'philadelphia'
  END;  -- exact city unit_id values to confirm against cities.py seed data before writing the real migration

-- Collapse unit_type
UPDATE geo_units SET unit_type = 'neighborhood'
WHERE unit_type IN ('nyc_neighborhood', 'la_neighborhood', 'chicago_neighborhood', 'philadelphia_neighborhood');

-- Widen uniqueness to include the parent, since unit_id is no longer globally unique per type
ALTER TABLE geo_units DROP CONSTRAINT geo_units_unit_type_unit_id_key;  -- exact name TBD from current schema
ALTER TABLE geo_units ADD CONSTRAINT geo_units_unit_type_unit_id_parent_key
  UNIQUE (unit_type, unit_id, parent_geo_unit_id);
```

Seeders: collapse the four `<city>_neighborhoods.py` seeders into one parameterized seeder (city passed as a param, or one seeder run 4x with different config: source file, city unit_id, tolerance) that writes `unit_type='neighborhood'` and sets `parent_geo_unit_id` by looking up the city row first. `geo_unit_adjacency` population changes from `WHERE unit_type = '<city>_neighborhood'` to `WHERE unit_type = 'neighborhood' AND parent_geo_unit_id = :city_geo_unit_id` (still scoped per city — adjacency must stay within a city, doesn't change semantics, just the filter).

## 4. Backend endpoint consolidation

- **`tiles.py`**: collapse the 4 neighborhood MVT endpoints into one `/neighborhoods/{z}/{x}/{y}.mvt` filtering `WHERE g.unit_type = 'neighborhood'` (mirrors the existing `/cities/{z}/{x}/{y}.mvt` pattern exactly), optionally accepting a `?city=` query param to scope to one city's tiles if the frontend wants to keep loading tiles per-focus-city rather than all neighborhoods nationwide at once (worth deciding based on tile payload size — check total feature count across all 4 cities before deciding). Same for adjacency: one `/neighborhoods/adjacency?city=<city_unit_id>` replacing the 4 near-duplicate endpoints. `_SIMPLIFY_TOLERANCE_BY_UNIT_TYPE` collapses to a single `GeoUnitType.NEIGHBORHOOD: {range(0,9): 0.0001}` entry. `_TILE_CACHE_PREFIX_BY_UNIT_TYPE` and the `reset_tile_cache`/`reset_adjacency_cache` if/elif chains collapse similarly.
- **`admin.py`** / **`geo.py`**: collapse the 4 `simplify_<city>_neighborhoods` endpoints into one `/simplify-neighborhoods?city=<city>` (or keep 4 thin endpoints that all call one shared `geo.simplify_neighborhoods(city, tolerance, precision)` — lower risk, since these are rarely-run admin tools and the endpoint names are presumably bookmarked/scripted by the user already; leaning toward keeping the 4 routes as thin wrappers over one shared function rather than renaming routes).
- **`leaderboard.py`**: `_GEO_STATS_LEVEL_UNIT_TYPES["neighborhood"]` changes from `"nyc_neighborhood"` to `"neighborhood"` — one-line change, but this is exactly the piece that currently hardcodes NYC and blocks non-NYC drill-down; fixing it here is what unblocks section 5 below.
- **`geo_units.py`**: no changes beyond the §1 bug fix — already unit_type-agnostic elsewhere.

## 5. Frontend consolidation (and the drill-down gap)

- **`CampaignMap.tsx`**: collapse the 5 duplicated per-city source/layer blocks (neighborhoods) into one, sourced from the new single `/neighborhoods/{z}/{x}/{y}.mvt` tile route, keyed by `unit_type === 'neighborhood'` instead of per-city literals. The stats-layer map at lines 4812-4823 collapses similarly. This is the biggest single frontend diff in the audit (~350 lines of near-duplicate layer wiring across the 5 blocks) but mechanical — same shape repeated 4x today.
- **`GeofencePicker.tsx`**: `UNIT_TYPE_OPTIONS` collapses the 4 per-city neighborhood entries into one `{value: "neighborhood", label: "Neighborhood", sourceLayer: "neighborhoods", route: "neighborhoods"}` row. Since a neighborhood picker without a city filter would show all 4 cities' neighborhoods overlapping at once (they're geographically disjoint, so not visually broken, but a bad UX for someone trying to pick one city's neighborhoods) — worth a city-scoping UI decision here (e.g. pick a city first, or filter by `parent_geo_unit_id` once a `city` selection exists elsewhere in the picker). Flagging as a decision to make during implementation, not blocking the scoping.
- **`GeoStatsExplorer.tsx` / `GroupGeoStatsExplorer.tsx`**: `levelsBelow()` changes from checking `unitType === "nyc_neighborhood"` to `unitType === "neighborhood"`, and the `unitType === null` root case (`["borough", "neighborhood", "zip"]`) needs to stay borough-first only for NYC-focused campaigns/groups once boroughs are back in scope — until then, simplify to `["neighborhood", "zip"]` at the root, dropping the NYC-only borough tier since it's non-functional anyway. This is the change that actually **closes the non-NYC drill-down gap** identified in §2 — a real functional improvement, not just a refactor, since Chicago/LA/Philadelphia campaigns currently cannot show a neighborhood breakdown in either Geo Stats explorer at all.
- **`GeoStatsMap.tsx` / `GroupStatsView.tsx`**: `LEVEL_TILE_INFO.neighborhood` changes from `{path: "nyc-neighborhoods", sourceLayer: "nyc_neighborhoods"}` to `{path: "neighborhoods", sourceLayer: "neighborhoods"}`, pointing at the new consolidated tile route — one change, but it needs to land in both files (still duplicated between them; consider extracting to a shared constant while touching both, though that's a nice-to-have not required for this consolidation).

## Proposed build order

1. **Land the §1 bug fix independently** (`get_geo_unit_stats` spatial join) — low-risk, unblocks the originally-reported issue immediately without waiting on the rest of this.
2. **Migration**: add `parent_geo_unit_id`, backfill it, collapse `unit_type` to `'neighborhood'`, widen the uniqueness constraint (section 3). Confirm exact city `unit_id` values from live `cities.py` seed data before writing the real UPDATE...FROM.
3. **Backend**: consolidate seeders into one parameterized neighborhood seeder; consolidate `tiles.py` endpoints (MVT + adjacency); update `_SIMPLIFY_TOLERANCE_BY_UNIT_TYPE`/cache maps; update `leaderboard.py`'s `_GEO_STATS_LEVEL_UNIT_TYPES`; update `admin.py`/`geo.py` simplify functions to take a city param. Re-seed all 4 cities' neighborhoods locally to confirm the new pattern round-trips correctly (per [[feedback_local_migrations_no_ask]] and [[feedback_seeding_pattern]], seed via the registry + `/admin/seed`, not a standalone script).
4. **Frontend, mechanical part**: collapse `CampaignMap.tsx`'s 5 duplicated layer blocks, `GeofencePicker.tsx`'s dropdown, and `LEVEL_TILE_INFO` in both `GeoStatsMap.tsx`/`GroupStatsView.tsx` to point at the new single tile route.
5. **Frontend, functional part**: update `levelsBelow()` in both explorer components to unlock non-NYC neighborhood drill-down — this is the actual feature win, worth calling out to the user as a visible behavior change (Chicago/LA/Philadelphia campaigns and groups gain a working Geo Stats neighborhood breakdown they don't have today) rather than a silent refactor.
6. **Defer**: `nyc_borough` consolidation, held until borough data is actually loaded in prod per [[project_nyc_borough_outline_deferred]] — revisit as its own scoping pass once that's true, reusing the same `parent_geo_unit_id` pattern.
