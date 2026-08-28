# Trash War Admin Data Dashboard — Scoping — 2026-08-22

**Status: Shipped and verified 2026-08-22.** Interactive campaign-wide admin dashboard + server-rendered PDF export, covering group/individual cleanups, routes, points/contributions, trash reports, and partners/offers/redemptions, including MapLibre visualizations for cleanups, routes, and trash-report locations.

## What shipped 2026-08-22

- `GET /api/campaigns/{campaign_id}/dashboard/{overview,cleanups,routes,contributions/breakdown,contributions/trend,trash-reports,partners}` (`backend/app/api/routes/campaign_dashboard.py`) — one endpoint per dashboard section, all gated to site admins (`profiles.is_admin`, via the same `viewer_user_id` query-param workaround as `admin.py`/`admin_prod.py`), all accepting the shared `interval`/`start_date`/`end_date` window params (`resolve_stats_window`). Reuses the dedup-before-join CTE pattern from `leaderboard.py`'s `/geo-stats` for bag/pound/points aggregates, so team-split cleanup events aren't multiplied by attendee count.
- `GET /api/campaigns/{campaign_id}/dashboard/export.pdf` — same section endpoints called directly (as plain async functions, bypassing HTTP) and rendered into a styled, print-quality HTML report via WeasyPrint, returned as a `StreamingResponse` download (`Content-Disposition: attachment`), matching the CSV/XLSX export convention already used in `groups.py`.
- `/admin/campaigns/[slug]/dashboard` (`page.tsx` + `CampaignDashboardView.tsx`) — server-gated the same way as `/admin` (redirect `/login` → redirect `/` if not admin), client view built on `IntervalPicker`/`statsWindowParams` (reused unmodified from group stats), Recharts for trend/breakdown charts (first use of Recharts in the codebase — added as a new dependency), and the existing `GeoStatsExplorer` embedded unmodified as the Geography section.
- "Dashboard →" link added per campaign row in `AdminPanel.tsx`'s campaigns tab (both mobile card and desktop table layouts).
- New backend dependencies: `weasyprint==63.1`, `jinja2==3.1.4` (`requirements.txt`). `Dockerfile` updated to `apt-get install` WeasyPrint's native dependencies (`libpango-1.0-0`, `libpangoft2-1.0-0`, `libharfbuzz-subset0`) on the `python:3.12-slim` base image. **Verified**: built the image (`docker build`), ran `HTML(...).write_pdf()` inside the container (produced a valid PDF), then ran the container against the local dev DB and hit all 7 data endpoints (200s) plus `/export.pdf` (produced a real 20KB PDF for the Trash War campaign) and confirmed a non-admin `viewer_user_id` gets 403.
- `frontend/src/app/admin/campaigns/[slug]/dashboard/CampaignDashboardMap.tsx` (new) — shared MapLibre component (colored point markers + colored GeoJSON route lines, auto-fit bounds, legend), embedded in the Cleanups section (group vs. individual event locations), Routes section (logged route lines), and Trash Reports section (open/resolved/other status coloring). Built fresh rather than reusing `GroupEventsMap.tsx`, which is tightly coupled to group-stats-specific event shapes (RSVP counts, cohost flags, popups) that don't apply at the campaign-wide aggregate level this dashboard needs.

## Known simplifications (not fixed this pass)

- **Cohost groups in "top groups"** — `cleanups`' top-groups aggregation in `/cleanups` only counts a cleanup's primary `group_id`, not `cleanup_event_cohosts`. A cohosted event's cleanup count/bags/pounds currently attributes only to the primary group, not both cohosts. Not fixed in this pass — same simplification the group-data-portal scoping doc flagged as worth a real test case, not assumed.
- **Team-total submission log detail** (`cleanup_team_total_logs`) and **event photo counts** (`cleanup_event_photos`) — tables exist and weren't queried; could add a "submission method" or "photo coverage" breakdown later if useful for funder reports, not requested for this pass.
- **Trash report claim-funnel detail** — `problem_reports`' claim columns (`claimed_by_user_id`, `claim_before_deadline_at`, `before_photo_url`, etc., from migration 037) aren't broken out; the dashboard only reports status/severity counts and average resolution time.

## Verification performed

- `npx tsc --noEmit` — clean, no type errors.
- `npm run build` — production build compiles cleanly, `/admin/campaigns/[slug]/dashboard` included in the route manifest.
- Docker: built `backend/Dockerfile`, confirmed WeasyPrint's `write_pdf()` works inside the container (native GTK3 deps resolve correctly).
- Ran the containerized backend against the local dev DB (via `host.docker.internal`) and hit all 7 data endpoints for the real Trash War campaign — all returned 200. `/export.pdf` returned a real, valid PDF (`file` confirmed `PDF document, version 1.7`) with correct headers (`Content-Disposition: attachment`, `application/pdf`). A non-admin `viewer_user_id` got 403 on `/overview`.
- Unauthenticated request to `/admin/campaigns/trash-war/dashboard` correctly 307-redirects to `/login`, confirming the page-level admin gate doesn't throw.
- **Not yet done:** logging in as an admin in a real browser session to visually confirm all sections + charts + maps render correctly and the interval picker drives them all in sync, in both light and dark theme. This needs a live login session, which wasn't simulated.

## Next steps

1. Log in as an admin and click through `/admin/campaigns/trash-war/dashboard` in the browser — confirm rendering, interval picker behavior, and both themes.
2. Update `master-backlog.md` and `app-capability-doc.md` to reflect the shipped dashboard (pending).
