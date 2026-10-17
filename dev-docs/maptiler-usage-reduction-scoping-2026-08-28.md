# MapTiler Usage Reduction — Scoping (2026-08-28)

## Why

MapTiler usage crossed the free tier and forced an upgrade to the $30/mo plan.
The app has ~19 separate MapLibre map instances plus a geocoding autocomplete,
all hitting `api.maptiler.com`. Several of these are avoidable or cheaper.

## Findings

1. **`GroupStatsView.tsx` (`renderMapSnapshot`)** — spins up a full off-screen
   interactive MapLibre map (loads vector style + fonts + sprites + every tile
   in the viewport) just to rasterize one PNG/JPEG for a stats snapshot/export.
   This is the most expensive possible way to get a static image.

2. **~19 map components** each load a full MapTiler vector style
   (`CampaignMap`, `PartnersMap`, `MiniMapPreview`, `RoutePicker`,
   `TrackRouteScreen`, `RouteNodeEditor`, `GroupEventsMap`,
   `BonusSpotContextMap`, `NearbyReportsMap`, `RadiusRadarMap`,
   `CampaignDashboardMap`, `BusinessLocationMapPicker`, `EventAreaMapPicker`,
   `RoutePreviewMap`, `GeoStatsMap`, etc.). Many of these (mini previews, admin
   pickers, snapshot renders) don't need MapTiler's "outdoor"/styled look —
   the app previously ran on free CartoDB Voyager tiles before the planned
   switch to MapTiler (see `campaign-app-scope.md`).

3. **`AddressAutocomplete.tsx`** — fires a MapTiler geocoding request on every
   keystroke once the input is 3+ characters, no debounce beyond that.

## Options

- [ ] **Snapshot maps → MapTiler Static Maps API.** Replace the off-screen
      interactive map in `GroupStatsView.tsx` with a single raster request to
      the Static Maps API. Isolated change, low risk, likely the single
      biggest reduction since it's a full map load per stats view/export.
- [ ] **Swap CartoDB Voyager back in** for maps that don't need MapTiler's
      styling: `MiniMapPreview`, admin pickers (`BusinessLocationMapPicker`,
      `EventAreaMapPicker`), snapshot renders. Free, no key, no quota impact.
- [ ] **Debounce/lengthen address autocomplete** — require 4-5 characters and
      add a real debounce timer (e.g. 300ms) before firing the geocoding call.
- [ ] **Self-host free vector tiles (OpenFreeMap)** for maps that stay on
      vector tiles but don't need MapTiler specifically — no usage caps.
- [ ] Check MapTiler dashboard's usage breakdown (maps vs. geocoding vs.
      static) before picking which of the above to prioritize.

## Status

Not started — deferred for later work per user request 2026-08-28.
