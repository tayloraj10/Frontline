# Master Backlog — 2026-08-07

Single source of truth for "what's left, across everything." Each item links to the dev doc with full context/detail — update that doc when working the item, then reflect status here. Pure how-to/setup guides (no backlog of their own) are noted at the bottom for reference, not repeated as tasks.

## Mobile / Capacitor / App Store push

- [ ] **iOS native scaffolding** — `npx cap add ios` never run, no `ios/` directory. Mac-only. → `ios-setup-2026-08-06.md`, `capacitor-scoping-2026-08-04.md`
- [ ] **Apple/Google dev account legal-entity decision** — proceeding on personal accounts for now; blocks physical iOS builds, signed release builds, store submission. → `capacitor-scoping-2026-08-04.md`
- [ ] **Android release keystore** — doesn't exist yet; needed for signing + `assetlinks.json` SHA-256. Until filled, Android App Links to `frontlinemaps.com` can't verify, so both Google OAuth return-to-app **and push notification tap-to-open** fall back to opening Chrome instead of the app (confirmed 2026-08-07 via a real push test on emulator). → `capacitor-scoping-2026-08-04.md`, `new-machine-setup-2026-08-06.md`, `android-release-checklist.md`
- [ ] **Restrict Firebase Android/iOS/Browser API keys** in Google Cloud Console (GitHub flagged `google-services.json` and `GoogleService-Info.plist` keys as exposed secrets 2026-08-07 — not real secrets, but should be restricted to package/bundle ID + SHA-1 anyway). **Deliberately left unrestricted for now (2026-08-09)** — user chose to prioritize finishing Android release prep first, revisit later. Package/bundle ID for both platforms is now `com.frontlinemaps.app` (renamed from `com.frontline.app` 2026-08-08 after discovering the old name was already taken on Play Store). There are currently **two Android keys** in Cloud Console (old `com.frontline.app` app was deleted from Firebase, but its auto-created key didn't disappear the way the old iOS key's did — likely just console cache lag, unconfirmed) — check both when restricting later. Add the release keystore's SHA-1 too once it exists or signed release builds will fail the restriction. → `android-release-checklist.md`, `ios-release-checklist.md`
- [ ] **Full Android/iOS release checklists scoped** (2026-08-07) — keystore/signing, store listing, privacy declarations, submission steps for both platforms, not yet executed. → `android-release-checklist.md`, `ios-release-checklist.md`
- [ ] **Push notifications: prod deploy** — Edge Function not deployed, migration 062 not applied to prod, Vault secrets not armed on prod DB. → `push-notifications-prod-deploy-checklist.md`
- [ ] **Push notifications: Android manual test pass** (backgrounded/killed app, tap-to-open routing) — needs real device/build. → `push-notifications-scoping-2026-08-06.md`
- [ ] **Push notifications: iOS test pass** — blocked on iOS scaffolding above. → `push-notifications-scoping-2026-08-06.md`
- [ ] **Social milestone pushes** (new, scoped 2026-08-07) — notify *other* users when someone hits a milestone, for engagement. Needs scope/volume/fan-out design before any migration work. → `push-notifications-scoping-2026-08-06.md` ("Backlog: social milestone pushes")
- [ ] **Foreground push has no tray banner on Android** (confirmed 2026-08-07, not a bug) — FCM send succeeds but Android suppresses auto-display while app is foregrounded; needs a `pushNotificationReceived` listener + `@capacitor/local-notifications` if a foreground tray banner is wanted. → `push-notifications-scoping-2026-08-06.md`
- [ ] **Milestone ladder headroom** — bag (caps at 100) and contribution-count (caps at 100) ladders top out much sooner than the points ladder (caps at 10000); extend if real usage shows users blowing past them quickly. → `push-notifications-scoping-2026-08-06.md`
- [ ] **Mobile-first design audit pass** — every page/component for layout, touch targets, breakpoints, safe-area handling; scoped as its own pass before/alongside Capacitor wrapping. → `dev-plan-2026-08-03-mobile-first.md` (item 8), `mobile-first-design-system.md`
- [ ] **Full mobile UI polish pass** (noted 2026-08-08, after first iOS on-device test) — current mobile UI is functional but rough (bottom tab bar, general layout); wants a proper visual pass plus animations/transitions once core functionality is stable. Broader than the bug-fix-level tweaks done during iOS bring-up (splash screen, bottom tab bar spacing, map safe-area cutoff). → `ios-setup-2026-08-06.md`
- [ ] **Audit remaining browser APIs for native WebView quirks** (noted 2026-08-08, after the camera fix) — the in-app camera (`getUserMedia`) needed a real native plugin (`@capacitor/camera`) because it silently didn't work in Capacitor's WKWebView; same risk category, not yet verified on-device: (1) `target="_blank"` links to arbitrary external sites/socials (partner website/social links, business "Visit website" popup on the Trash War map) don't route through `@capacitor/browser`'s `Browser.open` the way OAuth already does — Google Maps links happen to work today only because `google.com/maps` is an iOS universal link, not because the app handles it; (2) `navigator.clipboard.writeText()` copy-to-clipboard buttons (redemption code copy, support email copy, admin partner-apply URL copy) have no `@capacitor/clipboard` fallback if the WKWebView clipboard API turns out to be unreliable. → `capacitor-testing-guide.md`
- [ ] **Store listings** — screenshots, description copy, privacy policy URL, age rating, permissions justification. Not started. → `capacitor-scoping-2026-08-04.md`, `android-release-checklist.md`, `ios-release-checklist.md`
- [ ] **Build + submit** — TestFlight (Mac) and Android Internal Testing track, then review submission. Not started. → `capacitor-scoping-2026-08-04.md`, `android-release-checklist.md`, `ios-release-checklist.md`
- [ ] **React Native rewrite** — deferred until after Capacitor version ships. → `dev-plan-2026-08-03-mobile-first.md` (item 10)
- [x] **Drop "US & UK only" from the Trash War campaign card** — done (UI-only hide in `campaigns/page.tsx`, badge just doesn't render for `trash-war`; `geo_scope` data left untouched since the campaign is still genuinely US/UK-only). On `phase2/capacitor-scoping`, ships with that branch.

## Naming / branding

- [ ] **Rename "Trash War"** — blocked on picking a new name. Once named: display name, nav copy, marketing/legal docs, dev-doc titles, and a call on whether to rename the `trash-war` slug itself (bigger lift, affects URLs + seed data). → `dev-plan-2026-08-03-mobile-first.md` (item 4)

## Admin / roles

- [ ] **Multi-tier admin roles** (super admin / campaign admin) — not started, needs design: assignment model (join table vs. column), what "campaign-scoped" means per tab, settings-change sign-off flow. → `dev-plan-2026-08-03-mobile-first.md` (item 5)
- [ ] **`admin.py` has no auth/permission checks** on any route — prod-exclusion is the only current protection. Add real admin-role dependency check, then remove the exclusion. → `campaign-app-scope.md`
- [ ] **Flip `LEGAL_GATE_ENABLED` back to `true`** in `LegalGate.tsx` when ready to require re-acceptance (disabled 2026-08-02). Confirm migration `052_legal_acceptance.sql` is applied to prod first. → `dev-backlog-2026-07-24.md` (item 10)
- [ ] **Group applications migration `047_group_applications.sql`** — written but not yet applied to prod. → `campaign-app-scope.md`

## Territory / geo stats

- [ ] **Load `nyc_borough` data into prod DB** — borough stats toggle is shipped in code but non-functional in prod until this lands. → `project_nyc_borough_outline_deferred` memory, `dev-plan-2026-08-03-mobile-first.md` (item 6)
- [ ] **Per-borough stats UI/design** + decide outline coloring (plain gold vs. per-borough match-colored). → `dev-plan-2026-08-03-mobile-first.md` (item 6)
- [ ] **Territory decay cron is a deployed no-op** — `decay_elapsed` condition type never implemented, nothing sets `decay_starts_at`. → `campaign-app-scope.md`
- [ ] **Contested-zone alerts** — needs a margin-to-flip concept (currently only leader's `total_value` is stored, no runner-up), a `zone_contested` trigger, in-app-only notification surface. → `trash-war-feedback-backlog.md` (item 7), `project_trash_war_deferred` memory
- [ ] **Geolocation shared-owner refactor** — unify `CampaignMap`'s `GeolocateControl` + `ContributionPanel`'s independent trigger into one shared hook/store. Deferred, ~1-2 sessions, fully manual QA burden. → `cleanup-events-dev-plan.md` (item 12), `project_geolocation_shared_owner_refactor` memory
- [ ] **Group logo on captured territory** — deferred since territory-capture layer is going off by default; revisit if it becomes first-class again. → `cleanup-events-dev-plan.md` (item 11)
- [ ] **Cleanup pin-picker ZIP-lock is confusing/outdated** — dragging the pin when logging a cleanup is constrained to the user's starting zip/postcode (leftover from territory-claim anti-gaming), and always says "ZIP code" regardless of which geo layer is visible. Client-side only, not server-enforced. Leaning toward replacing with a distance-radius check instead of a geo_unit boundary. → `campaign-app-scope.md`

## Campaign system / events

- [ ] **Event condition types unimplemented**: `decay_elapsed`, `external_api` (schema only), `group_tie` (not even designed). → `campaign-app-scope.md`
- [ ] **Event effect types are stubs**: `notification`, `cascade_unlock`, `seasonal_reset`, `decay_start`. → `campaign-app-scope.md`
- [ ] **Campaign auto-`completed` transition** — not built (on `ends_at` pass or win condition). → `campaign-app-scope.md`
- [ ] **Cleanup Event contribution anti-fraud gap** — no server-side proximity check on `cleanup_event_id` submissions (client-side only). Deliberately deferred; escalation path if needed: flag-not-block → require photo → hard enforcement. → `campaign-app-scope.md`
- [ ] **Campaign Create Form**: `contribution_type` enum is confusing outside original 4-campaign context (decide enum vs. free text); `census_tract` geo unit has no loader/seeder (remove from dropdown or build TIGER loader). → `campaign-app-scope.md`
- [ ] **Campaign 6 (Ground Truth)** — post-launch, not started. → `campaign-app-scope.md`
- [ ] **Campaign 7 (Life Detox, board-game type)** — future, needs new `campaign_type`, board UI, progress tracking. → `campaign-app-scope.md`
- [ ] **Campaign 8 (Full Life)** — future, data model compatible, no contribution form/streak UI yet. → `campaign-app-scope.md`
- [ ] **Solarpunk multi-resolution hex grid** (res-3/res-5 zoom swap) — future, not built. → `campaign-app-scope.md`
- [ ] **Groups: category-tagging UI** — schema exists, UI doesn't. → `campaign-app-scope.md`
- [ ] **Group cleanup events: double-points multiplier never applies** (`apply_multiplier=False` hardcoded) — needs real design (geo-scoping, prorating mid-event, predictability) before changing. → `campaign-app-scope.md`
- [ ] **Partner businesses**: no per-business detail page (fine for now); no expiry/refund flow if a business goes inactive post-redemption (manual admin cleanup only); no push/email on redemption. → `campaign-app-scope.md`
- [ ] **Cleanup Routes (Phase 3)** — status **unclear/conflicting between docs**: `cleanup-routes-handoff.md` describes it as entirely not-started (new endpoint, `RoutePicker.tsx`, route detail page); `campaign-app-scope.md` describes "Cleanup routes (Beta)" as already shipped. **Reconcile which doc is current before resuming or re-scoping this.** → `cleanup-routes-handoff.md`, `campaign-app-scope.md`
- [ ] **Contractor bag tier** (~42-55 gal, ~10-13x a small bag) — needs new metrics column/migration, scoring multiplier, form/aggregation/admin/verification surfacing. → `trash-war-feedback-backlog.md` (item 7.5), `project_trash_war_deferred` memory
- [ ] **Business user portal**: no redemption-history detail (who/when), only a raw count. → `dev-backlog-2026-07-24.md` (item 9)

## Testing / QA (unexecuted)

- [ ] **Beta launch smoke test checklist** — signup/login/OAuth/profile/group admin/account settings/delete account/trash report/territory panel/hotspot/cleanup contribution/hex bloom — all unchecked. → `beta-launch-checklist.md`
- [ ] **External Model Imports** (Groups/Cleanups/Trash Reports canonical schema) — `beta-launch-checklist.md` lists as open/unresolved (API integration vs. migration vs. shared types package, undecided); **but `campaign-app-scope.md` shows this as done** — reconcile before treating as open. → `beta-launch-checklist.md`, `campaign-app-scope.md`
- [ ] **Deployment setup** — Railway vs. Cloud Run decision, Railway/Vercel project + env vars, CORS for prod domain, territory decay cron setup. → `beta-launch-checklist.md`
- [ ] **`game_settings` overhaul test plan** (migrations 056-057) — entirely unexecuted: settings page behaviors, hotspot/report-value tuning, recompute-all-balances fix verification (incl. bind-param truncation regression), spendable-points toggle preview fix, migration sanity checks, prod recompute-impact preview before any real recompute run. → `testing-strategy-game-settings-overhaul.md`
- [ ] **Cleanup Routes verification plan** (defined, not executed) — multi-zip crossing, valid/invalid zip rejection, individual/group/group-event paths, point-submission regression. → `cleanup-routes-handoff.md`

## Auth

- [ ] **Additional sign-in methods** (post-beta, not started): GitHub, Apple (required for iOS App Store once mobile ships), Discord, Twitter/X, Passkeys/magic link. → `campaign-app-scope.md`

## Post-MVP / big future bets (not started)

- [ ] React Native app + shared auth/API layer
- [ ] Collective Action Fund (pooled donation + voting) — needs legal review first
- [ ] Campaign creation tools for verified groups
- [ ] Weather API integration for dynamic events
- [ ] Advanced moderation layer for user-generated content
→ all in `campaign-app-scope.md`
- [ ] **Community Goals** (scoped 2026-08-07) — visible collective progress targets (platform-wide, per-campaign, per-group) to drive individual + group adoption; self-serve group goal creation is the piece most worth building for "use this as our tracking platform." Deliberately deprioritized behind mobile/Capacitor app store push. → `community-goals-scoping-2026-08-07.md`

## Explicitly decided out of scope (recorded so it doesn't get re-litigated)

- Retroactive point recalibration when bag/pound/multiplier constants change — decided against 2026-08-03. → `dev-backlog-2026-07-24.md` (item 8 Part B)
- Business self-serve management of additional business admins — revisit only if a business actually needs it. → `dev-backlog-2026-07-24.md` (item 9)
- Per-notification-type user preferences, rich push (images/actions), notification digests/batching. → `push-notifications-scoping-2026-08-06.md`

## Reference-only (setup/how-to guides, no independent backlog)

- `capacitor-testing-guide.md` — how to run against local dev vs. prod.
- `ios-setup-2026-08-06.md` — iOS scaffolding steps (tracked as tasks under Mobile section above).
- `new-machine-setup-2026-08-06.md` — moving to a new dev machine.
- `mobile-first-design-system.md` — design principles reference; its one backlog pointer is under Mobile above.
