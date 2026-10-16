# Frontline UI rework handoff

As of 2026-10-14. Branch `ui-rework`, app in `frontend/`.

## State

- Direction is "A · Ink": near-black, emerald accent, full light mode. Desktop keeps the header nav.
- Typecheck with `npx tsc --noEmit -p .` from `frontend/`. Clean at last run.
- Keep tracked config Windows-safe. Read `node_modules/next/dist/docs/` before writing Next-specific code (see `frontend/AGENTS.md`).

## Done recently

- Trash map page: full-bleed map, floating header, chips plus bottom sheet, floating back button and search pill, ⋯ menu.
- Partner and group pages: social links and map/directions links are now 44px icon pills (new `components/ui/SocialIcon.tsx`).
- Groups list: compact mobile header, search and My Groups on one row, cards without the green edge or arrow, green Details pill like the rewards page.

## Still to do on the map page

- Restyle the bottom-left Log Cleanup / Report Trash buttons and the Terrain/Streets/Satellite switcher.
- Make the countdown, sky and amber pills and the selected-item detail panels respect `--map-top` on desktop.
- Restyle the Layers/legend, the tiles-loading chip, and the pin/area/route picker banners.
- Decide where the dropped heatmap "What counts" tag row goes.
- Remove unused imports in `campaigns/[slug]/page.tsx`.
- Re-screenshot light mode with tiles fully loaded.

## Open decisions

- How to reach the `/campaigns` list on mobile. Today the only route is the map's back button. Options: an "All campaigns" row in the ⋯ menu, or make the Map tab go to `/campaigns`.
- Sweep other mobile pages for small text links (the "‹ Groups" back link and "Leave Group" are still text-style)?
- Rename desktop nav labels (Campaigns → Map, Partners → Rewards)?
- Group card Details pill narrows descriptions. Alternative: a full-width bottom row.

## Known small items

- "1RSVP'd" spacing bug.
- Lint cleanup.
- Full dark/light by 390/1440 visual pass.
- TikTok, YouTube, Facebook and X icon paths in `SocialIcon.tsx` were retyped; only Instagram and the globe were checked visually.
