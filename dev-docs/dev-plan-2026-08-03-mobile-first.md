# Dev Plan — 2026-08-03: Trash War Pivot + Mobile-First + App Store Launch

Fresh list dropped 2026-08-03. Status legend: `[ ]` not started · `[~]` in progress · `[x]` done.

This doc has two phases: a short cleanup phase (rename/hide campaigns, tiered admin roles, territory rework), then the main phase — converting the whole app to mobile-first design and shipping iOS/Android apps.

---

## Phase 0: Already done

## 1. Finish dev backlog

- [x] `dev-docs/dev-backlog-2026-07-24.md` — all 15 items closed out (confirmed by user across several 2026-08-01/02/03 sessions). Two known loose ends live in that doc, not repeated here: Part B of #8 (retroactive point recalibration) is permanently out of scope, and the legal re-acceptance gate (#10) is built but intentionally disabled (`LEGAL_GATE_ENABLED = false`).

## 2. `engine-admin-changes` branch — app engine values to admin page

- [x] Merged to master via PR #29 (`ac9857b`). Game settings (`small_bag_value`, `large_bag_value`, `pound_value`, `hotspot_multiplier`, `claim_challenge_multiplier`, etc.) are now admin-configurable `game_settings` rows instead of hardcoded constants, with UI in `AdminPanel.tsx`'s Settings tab.
- Note: this branch did **not** add tiered admin roles — today there's still only a single binary `profiles.is_site_admin` flag gating the whole admin page. Item 5 below (super admin vs. campaign admin) is new, unbuilt work, not something this branch already covers.

---

## Phase 1: Cleanup / positioning (partial — some blocked on decisions)

## 3. Hide all campaigns but Trash War

- [x] De-emphasize non-Trash-War campaigns from the campaign picker/listing so Trash War reads as the main product. Went with the visually-demoted approach: new collapsed `OtherCampaignRow.tsx` component on `frontend/src/app/campaigns/page.tsx`, staged on branch `phase1/task3-hide-other-campaigns`.

## 4. Rename "Trash War" to something more generic

- [ ] Blocked on the user picking a new name. Once named, this is a verbiage/branding sweep — campaign display name, nav copy, marketing/legal doc references, `trash-war-feedback-backlog.md`/dev-doc titles (historical docs can keep the old name for context), possibly the `trash-war` slug itself (slug rename is a bigger lift — affects URLs, `campaigns.counts_toward_spendable_points` seed data keyed off it, etc. — decide whether to rename the slug or just the display name).

## 5. Multi-tier admin roles (super admin / campaign admin)

- [ ] New role model on top of the current binary `is_site_admin`:
  - **Super admin** (self): full access to everything, including the Settings tab (global game-engine values, spendable-points toggles, etc.).
  - **Campaign admin**: scoped to their campaign's data in the admin panel, but *does* get Groups and Partners access regardless of campaign scope (per explicit ask). No access to the Settings tab — any change there needs super-admin sign-off.
- Needs design before implementation: how is a campaign admin assigned to a campaign (new join table? `profiles.admin_campaign_id`?), what "campaign-scoped" means precisely per admin-panel tab (Events? Reports? Territory/stats?), and what a settings-change "sign-off" flow looks like (request + approve, or just hard-block with no request mechanism yet).

## 6. Replace territory claiming with zip/neighborhood/borough stat layers

- [~] Per NYC cleanup-group feedback: territory claiming/guarding creates unwanted competition. Replace with toggleable stats-only layers (zip code, neighborhood, borough), keep it running in the background so it can be re-enabled, let users toggle visibility.
- Deprioritized per [[project_territory_capture_going_dark]] — user is already planning to turn the territory-capture layer off by default soon, so this folds into that direction rather than being new scope. Coordinate before starting: confirm this fully replaces (not just supplements) the toggle-off plan, and whether "neighborhood" needs a new geo dataset/join (app currently only has zip-code-level `territory_claims`, no neighborhood/borough boundary data yet — needs a data source, e.g. NYC borough/neighborhood GeoJSON).
- Groundwork done 2026-08-03: `nyc_borough` geo units (5 boroughs, NYC Open Data source, trimmed of small Jamaica Bay / Pelham Bay islets) built, seeded to local dev, and served via `/tiles/nyc-boroughs/{z}/{x}/{y}.mvt`. `CampaignMap.tsx` has a ready-to-enable gold outline layer for it (currently commented out — see [[project_nyc_borough_outline_deferred]]) plus a new "Zoom to NYC" map control (🗽 icon) alongside the existing US/UK zoom buttons. Still needed before the actual stats-layer work: load `nyc_borough` into the **prod** DB, design the per-borough stats data/UI, and decide whether the outline re-enables plain gold or per-borough `match`-colored.

---

## Phase 2: Mobile-first + app store launch (the main effort)

## 7. Standing rules for this phase

- [x] Noted and saved to memory ([[feedback_mobile_first_and_prod_safety]]): don't break prod, bundle changes into releases rather than shipping piecemeal for mobile, design UI mobile-first going forward.

## 8. Mobile-first design pass over the whole app

- [ ] Audit every page/component for mobile layout, touch targets, responsive breakpoints, safe-area handling. Scope this as its own pass before wrapping in Capacitor — a mobile-wrapped desktop-first UI will feel bad in the stores.

## 9. Capacitor wrapper — get iOS/Android apps into the stores fast

- [ ] First mobile milestone. Wrap the existing Next.js frontend with Capacitor, get store-listing-ready builds for both iOS (App Store) and Android (Play Store). Needs: Capacitor setup, native project scaffolding, app icons/splash screens, store listings/screenshots, developer accounts (Apple Developer Program, Google Play Console) if not already set up, push-notification/deep-link behavior check if the app uses either.

## 10. React Native app (longer-term, nicer/more premium)

- [ ] Deferred until after the Capacitor version ships. Full native rebuild for a more premium feel — separate effort, not started.

---

## Notes

- Untriaged as dropped by the user 2026-08-03 — confirm scope before starting each open item, especially #4 (needs a name decision), #5 (needs a role-model design decision), and #6 (needs to be reconciled with the territory-capture-going-dark plan, see [[project_territory_capture_going_dark]]).
- #3–#6 are the "smaller cleanup" items the user flagged as not all fully doable yet; #7–#10 are the main mobile-first/app-store effort.
- Related docs: [[project_capability_doc]] (`external-docs/app-capability-doc.md`) should get updated once #3–#6 ship, per [[feedback_scope_doc]] convention. `campaign-app-scope.md` likely needs a pass too once Trash War is renamed.
