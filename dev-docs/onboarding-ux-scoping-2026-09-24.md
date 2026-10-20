# Onboarding / UX clarity — scoping (2026-09-24)

Goal: make Frontline's user flows self-explanatory enough that a stranger can install/open the app and use it correctly with zero outside guidance. Not a redesign — targeted fixes to discoverability, in-context explanation, and error clarity.

## Current state (audited 2026-09-24)

- **First-visit onboarding** (`OnboardingModal.tsx`) — 3-step welcome shown once via `localStorage["frontline_onboarded"]`, then gone forever. No nav entry to replay it.
- **Per-campaign explainer** (`CampaignInstructionsModal.tsx`) — grid-layout "How it works" modal, reopenable via a `?` button next to the campaign map. Already uses `modal-max-h-85` (dvh-aware max-height + internal `overflow-y-auto`) — the "overflows on mobile" backlog item (noted 2026-08-11) may already be resolved by this; needs an on-device check before further work, not a blind re-fix.
- **Guided-stepper forms** — contribution logging, cleanup-event create, partner-offer create/edit all use a shared `GuidedStepper`/`StepperNav`/`ViewModeToggle` pattern. `BusinessForm.tsx` (business apply/admin-create) and `ApplyGroupForm.tsx` (group apply) are still flat single forms — inconsistent with the rest of the app.
- **Error messages** — raw fetch/Supabase errors (`TypeError: Load Failed`, `Failed to fetch`, Postgres codes like `23505`) leak to users across ~40 files. A `friendlyErrorMessage()` helper exists only locally in `PartnerDashboardClient.tsx`, not shared.
- **No persistent help surface** — no `/help`, `/faq`, or nav entry point for "how do I use this app" outside the one-shot onboarding modal.
- **Feature density with no in-context rationale** — territory-claim vs. geo-stats toggle, 4 points-bases for self-logging a cleanup, organizer-total vs. individual event logging, claim-a-report challenge: all require the user to already know why they'd pick one option over another.
- **Naming** — "Trash War" itself flagged elsewhere as confusing for first impressions; rename still blocked on picking a new name (tracked separately in master-backlog.md).

## Plan

### Phase 0 — quick, low-risk wins (this pass)
1. Centralize `friendlyErrorMessage()` into `lib/errors.ts` and roll it out to the ~40 files that currently surface raw `.message` text to users.
2. Add a persistent "Help / How this works" entry point (nav) that replays the onboarding steps on demand — not just first-visit.
3. Confirm (don't blind-fix) whether `CampaignInstructionsModal` still overflows on a real small/short mobile viewport; the dvh-based CSS looks correct already.

### Phase 1 — contextual guidance at decision points
4. Inline "?" explainers next to the genuinely confusing choices (geo-stats vs. territory toggle, points-basis picker, organizer-total vs. individual event mode) instead of front-loading everything into onboarding.
5. Extend the guided-stepper pattern to `BusinessForm.tsx` and `ApplyGroupForm.tsx` for consistency (already tracked as a low-priority backlog item).

### Phase 2 — structural
6. Run the mobile-first design audit pass already scoped (`mobile-first-design-system.md`) — touch targets, layout, breakpoints.
7. Revisit the "Trash War" rename for first-impression clarity.
8. IA/nav audit: walk every flow cold, check nothing is a dead end or undiscoverable from the bottom tab bar.

### Phase 3 — measure, don't guess
9. Light event tracking on onboarding-step drop-off and first-use of major features, so later fixes target where real users actually get stuck.

## Status
- [x] Phase 0 item 1 — `lib/errors.ts` created, `friendlyErrorMessage()` rolled out across all ~40 flagged files
- [x] Phase 0 item 2 — `HelpButton.tsx` added to `AppHeader` (global, all pages); `OnboardingModal.tsx` now supports a controlled `open`/`onClose` mode alongside its original first-visit localStorage gate, so it can be replayed on demand from anywhere, not just first-visit. Last step's "Browse all campaigns" is now a plain `/campaigns` link (works even with no `campaigns` prop passed).
- [ ] Phase 0 item 3 — instructions-modal overflow: dvh-based CSS already looks correct in code; needs an on-device check by the user to confirm, not a code fix
- [ ] Phase 1+

## Walkthrough rollout (added 2026-10-14)

Decision: build stepped, mobile-first walkthroughs for every major flow, modeled on the new Trash War one. On hold until the dialog/modal improvements are done.

Done:
- `components/TrashWarWalkthrough.tsx` (10 steps, mock UI visuals, numbered how-tos, swipe, bottom sheet on mobile). Trash War only, wired in `CampaignInstructionsModal.tsx`. Auto-shows on first visit, reopens from the `?` button.

Candidate walkthroughs and help, roughly by priority:
1. Inline "?" tips at confusing choices: points basis picker, organizer total vs. individual event logging, zip leaders toggle.
2. "New here? See how it works" nudge on the map for users who missed the first-visit modal.
3. Group organizer first run: "Host your first event".
4. Partner dashboard: how offers and redemptions work.
5. Empty states (Mine, Activity, new group, new profile) that say what to do next.
6. Check `OnboardingModal` and the Trash War walkthrough do not both show back to back for new users.
7. Other campaigns (Touch Grass, Solarpunk) still use the old grid instructions modal.

Open items on the Trash War walkthrough: the Routes step wording ("choose Route") and the shop-logo claim on reward pins are unverified against the live flow; random bonus spots are not covered.

### Walkthrough rollout status (2026-10-15)

Built per `walkthroughs-scoping-2026-10-15.md`: shared `components/walkthrough/` infra (replaces `TrashWarWalkthrough.tsx`), plus guides for Trash War, Touch Grass, Solarpunk, partner, organizer, attendee and site admin; notification primer and location-denied recovery; empty states; inline tips on logging mode and redemption mode. Copy is based on code reading and not yet verified on a device. Note: `HelpButton.tsx` mentioned above does not exist on the `ui-rework` branch.

Update 2026-10-15: `OnboardingModal.tsx` was replaced by `components/WelcomeTour.tsx` and the `welcome` walkthrough (4 steps, same style as the other guides). It keeps the `frontline_onboarded` key, auto-opens once for signed-in users on `/campaigns`, and is replayable from a "Welcome tour" link in the `/campaigns` page header.
