# Frontline To-Do

Last updated 2026-10-17. Move items between sections to reprioritize. Doc names in parentheses are where the details live (all in `dev-docs/` unless noted).

Legend: anything after a `!` is a note for Claude. On a task, the text after `!` is its status or a comment.

## Branches in progress

- **money-and-payments**: Payments v2 (Plus, sponsorships, Impact page, sponsored cleanups). Resuming work and testing soon. Next: live Stripe test, merge master in, then you apply migrations 109-119 to prod. Has uncommitted work. Rewards fulfillment and per-event impact report are part of this branch. Docs: payments-v2-scoping-2026-10-15, payments-v2-test-plan-2026-10-15, payments-scoping-2026-08-20 (these three exist only on the branch), branch-tracker.
- **ui-improvements-9-27-26**: friendly error messages, 35 files. Revisit after the big UI rework to see what is already covered and whether anything is left. Docs: master-backlog (raw error messages item), onboarding-ux-scoping.
- **android-fixes**: version bump and manifest permission cleanup. Believed deployed to the Android store, awaiting Google Play review. Merge once approved. Docs: android-release-checklist.
- **loading-improvements** (remote only): loading skeletons and nav spinner. Come back to it at some point. Docs: none yet.
- **ttf-partner-logo**: Trash Foundation badge. Fine to keep around. Docs: branch-tracker only.
- **caching-improvements, greening_campaign**: scrapped for now, kept. Docs: none.
- **undo-redemption**: decided not to do this. Branch is kept, nothing deleted. Docs: none. Related: admin-unredeem-offer-scoping (also parked).
- Nothing gets deleted: the ~40 fully merged local branches and 7 stashes stay.

## Now (high priority)

- [ ] Scope new point-earning actions, especially ones that work in cold and bad weather. Two buckets: greening actions (planting, watering, composting, etc.) and winter-proof or indoor activities, since people won't pick up trash when it's cold. Needs a new scoping doc. Also ties into the plan to fold everything into one master campaign.  Docs: none yet, write a new scoping doc. Related: random-bonus-spots-scoping, hotspot-hero-challenge-scoping, campaign-app-scope.
- [ ] Resume testing and finish `money-and-payments` (see Branches) Docs: payments-v2-test-plan-2026-10-15, branch-tracker.
- [x] Move Railway crons to Infrastructure as Code before 2026-12-01. Done 2026-10-17: `.railway/railway.ts` applied to prod, the 5 `backend/railway*.toml` files deleted. Future config changes: edit the file, then `railway.exe config plan` and `config apply --yes` (it does not apply on git push). Left: apply the `watchPatterns` change (backend-only deploys), check Vercel skips frontend builds for backend-only pushes.
- [ ] Lock down FastAPI auth, e.g. `/api/account/{user_id}` trusts the path id (master-backlog)
- [ ] Fix push notifications, iOS first (push-notifications-ios-debugging)

## Next (medium)

- [ ] Staging environment, for both frontend and backend. Will be needed soon (staging-environment-scoping)
- [ ] Email audit: review every email we send today, confirm they all work and read well, then decide what to add. Known gaps: partner/organizer coordination, attendee reminder blast, day-before organizer reminder Docs: app-capability-doc (external-docs), master-backlog.
- [ ] Revisit work verification strategies, including the cleanup event anti-fraud proximity gap and the confusing pin-picker ZIP lock (campaign-app-scope) Docs: campaign-app-scope.
- [ ] Admin page styling improvements, all admin pages (the Trash War admin dashboard light/dark check folds into this) Docs: trash-war-admin-dashboard-scoping.
- [ ] Multi-tier admin roles: believed set up but never fully tested (master-backlog)
- [ ] Live route tracking: working in prod but not extensively tested (live-route-tracking-scoping)
- [ ] Push follow-ups: foreground banner, test passes, social milestone pushes (push-notifications-scoping)
- [ ] Cut MapTiler costs (maptiler-usage-reduction-scoping)
- [ ] Instagram flyer to prefill Host Event form (instagram-flyer-event-prefill-scoping)
- [ ] Business proximity bonus (business-proximity-cleanup-bonus-scoping)
- [ ] Random bonus spots (random-bonus-spots-scoping)
- [ ] Neighborhood geo-unit consolidation. The empty "Recent Activity" panel bug is a separate item, split it out when you pick this up (neighborhood-geo-unit-consolidation-scoping)
- [ ] Grant report CSV export for groups. Not in the current payments scope, but a good idea (payments scoping, on the `money-and-payments` branch) Docs: payments-scoping docs on `money-and-payments`, master-backlog (Plus rewards fulfillment item).
- [ ] Rename "Trash War", or fold it into one master campaign as other ways to earn points are added. Leaning toward "War on Trash", not decided (dev-plan-2026-08-03-mobile-first) Docs: dev-plan-2026-08-03-mobile-first.

## Later (low)

- [ ] "Get directions" should open Apple Maps on iOS Docs: master-backlog, ios-setup-2026-08-06.
- [ ] React Native rewrite. Capacitor is working well, so this waits Docs: dev-plan-2026-08-03-mobile-first, capacitor-scoping-2026-08-04.
- [ ] Hot Spot Hero: bonus for clearing a whole cluster of nearby trash reports in one outing, with a route through them (hotspot-hero-challenge-scoping)
- [ ] Community Goals: shared "help us hit X" targets for the whole app or a single group. Sounds good, not started (community-goals-scoping)
- [ ] Shared Points API: standalone service so other apps can plug into our points system. Revisit eventually (shared-points-api-scoping)
- [ ] Group data portal historical import. Better to encourage groups to just use the app (group-data-portal-scoping)
- [ ] Share card visual enhancements (low, revisit later) Docs: master-backlog (Share cards).
- [ ] Sync Google avatar changes (about 30 lines, may not be worth it) Docs: master-backlog.
- [ ] Geolocation shared-owner refactor; group logo on territory (cleanup-events-dev-plan)
- [ ] Team events Phase 2: participation hierarchy (individual vs. representing a group), event stats page, submission review page, geofencing. Version 1 is live (team-events-phase2-scoping)

## Verify, then close or keep

Quick checks. If it's done, delete the line. These come from your notes saying "think this is done".

- [ ] `LEGAL_GATE_ENABLED` is on in prod (dev-backlog-2026-07-24)
- [ ] Migration 047 (group applications) is on prod. Check the schema in the Supabase dashboard Docs: master-backlog.
- [ ] Store listing content and screenshots (app-store-listing). Copyright holder and category were undecided
- [ ] Mobile-first design audit, handled by the UI overhaul? (mobile-first-design-system)
- [ ] Nearby-business suggestions, piece 2 of event-redeemable offers (event-redeemable-offers scoping)
- [ ] Group cleanup event volume bonus (master-backlog)
- [ ] Organizer bulk-close of nearby trash reports (master-backlog)
- [ ] UI rework map page items. `ui-rework-handoff` lists restyling the bottom-left buttons, layers legend and picker banners, plus open decisions on reaching `/campaigns` on mobile
- [ ] Walkthrough leftovers (walkthroughs-scoping, onboarding-ux-scoping)
- [ ] Campaign info-modal overflow on device Docs: onboarding-ux-scoping, master-backlog.
- [ ] Guided-modal treatment for BusinessForm and ApplyGroupForm Docs: master-backlog.
- [ ] `nyc_borough` data loaded in prod, and the per-borough stats UI, geo stats page and ZIP heat map layer all fine Docs: app-capability-doc (external-docs), campaign-app-scope.
- [ ] Group double-points multiplier. The backlog says `apply_multiplier=False` is hardcoded in group cleanup events, so it never applies Docs: master-backlog, campaign-app-scope.
- [ ] Clean data deletion with downstream reset. The Moderation tab can hide a reported photo, but the backlog says there is no way to also reset the downstream points (master-backlog) Docs: master-backlog.
- [ ] Cleanup Routes: you say it's live and working. The docs disagree on status, see Doc cleanup (cleanup-routes-handoff vs campaign-app-scope)
- [ ] `game_settings` admin overhaul test plan (testing-strategy-game-settings-overhaul). Probably done, the doc is a checklist of manual checks on the admin Settings tab

## Not sure what this is (plain explanations)

- **`admin.py` has no permission checks:** the backend admin routes have no login or admin check. The only protection is that they are switched off in production. Real risk is low in prod today, but it needs fixing before anything depends on it. Natural to do alongside the FastAPI auth item.
- **Restrict Firebase API keys:** GitHub flagged the API keys in `google-services.json` and `GoogleService-Info.plist`. They are not real secrets, but they can be restricted to our app in Google Cloud Console. Deliberately deferred (android-release-checklist).
- **Back up the signing keystore:** `frontline-app-signing-key.jks` has no backup. If you lose it you cannot ship Android updates. Copy it somewhere safe (password manager or encrypted drive).
- **Audit WebView quirks:** in the Capacitor app, things like external links and clipboard can behave differently than in a browser. A one-time check pass (capacitor-testing-guide).
- **Campaign Create Form gaps:** the `contribution_type` enum is confusing, and `census_tract` shows up in the dropdown but no data exists for it, so selecting it does nothing useful. Fix is to remove it from the dropdown or build a loader (campaign-app-scope).
- **Beta smoke-test checklist:** a 25-item manual checklist from before launch. The app has been live since 2026-06-23, so most of it is likely moot. Probably archive it (beta-launch-checklist).
- **Cleanup Routes docs:** `cleanup-routes-handoff` says Phase 3 is not started, `campaign-app-scope` says otherwise. You say it works, so just fix the doc.
- **External Model Imports:** a pre-launch idea about a shared schema for Groups/Cleanups/Trash Reports with other apps. `beta-launch-checklist` says open, `campaign-app-scope` says done. Closely related to the Shared Points API idea.

## Doc cleanup

- [ ] `master-backlog.md` mobile/store section says the Android keystore and iOS project don't exist. They do. Reword.
- [ ] Remove the old duplicate "Working order" lists in `master-backlog.md` (08-11, 08-27, 08-30). Only 09-13 is current.
- [ ] Mark "Raw error messages ~40 files" in `master-backlog.md` as done (it is, on `ui-improvements-9-27-26`)
- [ ] `branch-tracker.md`: heading `partner-apply-account-required` is really `business-submission-rework`
- [ ] Fix Cleanup Routes status so `cleanup-routes-handoff` and `campaign-app-scope` agree
- [ ] External Model Imports: make `beta-launch-checklist` and `campaign-app-scope` agree

## Parked (decided not to do for now)

- Supabase backups to R2: not needed while on Supabase premium (supabase-backup-strategy-scoping)
- Admin "Unredeem" offer action (admin-unredeem-offer-scoping)
- Android Apple Sign-In redirect: no reason to offer Apple login on Android
- Territory decay no-op, missing event condition/effect types, campaign auto-complete. Reconsider as data grows (campaign-app-scope)
- Contested-zone alerts: moved away from the claiming mechanic (trash-war-feedback-backlog)
- Future campaigns 6/7/8, Solarpunk hex grid, extra sign-in methods: no plan to add more campaigns
- Post-MVP bets (Collective Action Fund, campaign creation tools, weather API, advanced moderation): scrapped for now

## Doc index (every doc and where it is tracked)

Reference docs, no task needed:
- `campaign-app-scope.md`: master product spec, source for many items above. Has uncommitted payments edits, see Uncommitted changes
- `master-backlog.md`: older backlog, being replaced by this file. Has uncommitted edits
- `branch-tracker.md`: branch status and migration numbering, feeds the Branches section
- `capacitor-testing-guide.md`, `new-machine-setup-2026-08-06.md`, `ios-setup-2026-08-06.md`, `capacitor-scoping-2026-08-04.md`, `dev-plan-2026-08-03-mobile-first.md`: setup and mobile background
- `mobile-first-design-system.md`: design rules, see "Mobile-first design audit" under Verify
- `partner-offer-suggestions-2026-08-12.md`: guidance for suggested partner offers, no open task
- `cleanup-events-dev-plan.md`: group cleanup events backlog, mostly done, remaining items are the shared-owner refactor and group logo (Later)
- `trash-war-feedback-backlog.md`: mostly done, contested-zone alerts parked
- `dev-backlog-2026-07-24.md`: mostly done, LEGAL_GATE check under Verify
- `external-docs/app-capability-doc.md`, `app-capability-doc-external.md`, `frontline-partner-overview.md`: feature docs, update when features ship
- `docs/game-engine-scoring-rules.md`, `backend/docs/cleanup-events-flow.md`: engine reference

Done or shipped, nothing to track:
- `granular-bag-tracking-scoping-2026-09-02.md` (PR #103)
- `group-event-route-tracking-scoping-2026-08-29.md` (PR #98)
- `trash-war-admin-dashboard-scoping-2026-08-22.md` (shipped; styling follow-up is under Next)
- `help-button-consistency-notes-2026-10-15.md` (PR #106)
- `onboarding-ux-scoping-2026-09-24.md` (Phase 0 done, leftovers are under Verify)
- `app-store-listing-2026-08-10.md` (verify under Verify)

Linked to a task above:
- Now: `.railway/railway.ts` (Railway IaC), `push-notifications-ios-debugging-2026-08-30.md`, `push-notifications-prod-deploy-checklist.md`
- Next: `staging-environment-scoping-2026-08-10.md`, `maptiler-usage-reduction-scoping-2026-08-28.md`, `push-notifications-scoping-2026-08-06.md`, `instagram-flyer-event-prefill-scoping-2026-09-13.md`, `business-proximity-cleanup-bonus-scoping-2026-08-14.md`, `random-bonus-spots-scoping-2026-08-26.md`, `neighborhood-geo-unit-consolidation-scoping-2026-09-04.md`, `live-route-tracking-scoping-2026-08-22.md`
- Later: `hotspot-hero-challenge-scoping-2026-08-27.md`, `community-goals-scoping-2026-08-07.md`, `shared-points-api-scoping-2026-08-13.md`, `group-data-portal-scoping-2026-08-11.md`, `team-events-phase2-scoping-2026-08-29.md`
- Verify: `event-redeemable-offers-and-nearby-business-suggestions-scoping-2026-08-26.md`, `ui-rework-handoff.md`, `walkthroughs-scoping-2026-10-15.md`, `cleanup-routes-handoff.md`, `testing-strategy-game-settings-overhaul.md`, `beta-launch-checklist.md`, `android-release-checklist.md`, `ios-release-checklist.md`
- Parked: `supabase-backup-strategy-scoping-2026-08-28.md`, `admin-unredeem-offer-scoping-2026-09-19.md`

## Uncommitted changes in git

Everything currently uncommitted, and what it relates to. Nothing here is committed.

- New docs (all untracked, all covered above): the 12 scoping docs listed in the index, `branch-tracker.md`, and this file
- `.railway/railway.ts`, `.railway/package.json` and lockfile (railway SDK, run `npm install` in `.railway/` on a fresh clone), deletion of the 5 `backend/railway*.toml` files: the Railway IaC task under Now. `railway.ts` is already applied to prod
- `dev-docs/master-backlog.md`: new working-order lists, items marked done, payments entries
- `dev-docs/campaign-app-scope.md` and `external-docs/app-capability-doc.md`: new Payments v2 and Frontline Plus sections. Payments v2 only exists on `money-and-payments`, so these edits arguably belong on that branch rather than master
- `.vscode/tasks.json`: one-line change, `npx supabase start` to `npx -y supabase start`. No task, harmless tooling tweak
