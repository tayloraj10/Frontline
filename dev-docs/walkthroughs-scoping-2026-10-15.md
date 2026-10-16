# Flow walkthroughs: scoping (2026-10-15)

Goal: every major user flow gets a short, stepped explainer so nobody gets stuck. Modeled on `TrashWarWalkthrough.tsx`. Builds on the "Walkthrough rollout" section of `onboarding-ux-scoping-2026-09-24.md` (which is on hold until the dialog/modal improvements land).

## What exists today

- `components/TrashWarWalkthrough.tsx`: 11 steps, each with a title, body, optional numbered "how" list, optional Beta badge, and a small mock-UI "Stage" visual. Bottom sheet on mobile, centered on desktop, swipe + Back/Next, portal to `document.body`. The step data is hardcoded in the file, so it is not reusable as is.
- Wired only in `CampaignInstructionsModal.tsx` (`slug === "trash-war"`). Auto-shows on first visit per campaign (`localStorage`, `storageKey(slug)`), reopens from the `?` button by the map.
- `OnboardingModal.tsx`: 3-step first-visit welcome, replayable from `HelpButton.tsx` in `AppHeader`.
- Other campaigns still use the old grid instructions modal.
- Guided steppers (`GuidedStepper`, `StepperNav`) exist on contribution logging, cleanup-event create, and partner-offer create/edit. `BusinessForm.tsx` and `ApplyGroupForm.tsx` are still flat forms.
- `/how-points-work` page exists (static explainer for points).

## Step 0: extract a shared component (do first)

Rename/refactor `TrashWarWalkthrough` into a generic `Walkthrough` that takes `{ steps, title, storageKey, onClose, intro? }`. Move the shared bits (`Stage`, `Chip`, `PILL`, `svgProps`) into `components/walkthrough/` and keep step data in per-flow files (`walkthroughs/trashWar.tsx`, etc.). Then:

- A `useWalkthrough(key)` hook: first-visit auto-open via `localStorage` (wrapped in try/catch), `open()`, `close()`.
- A small `<WalkthroughTrigger>` "?" button so every flow has the same reopen affordance.
- Central rule so two walkthroughs never auto-open on the same page load (also covers the open item "OnboardingModal and Trash War walkthrough should not show back to back").
- Keep last-step CTA label configurable (Trash War says "Start cleaning").

Cheap, mechanical, and every later walkthrough becomes just a data file.

## Candidate walkthroughs by audience

Sources: `external-docs/app-capability-doc.md` (role breakdown) and the app routes. Priority is by "how likely is someone to get stuck, and how costly is it".

### P1: Group organizer (highest stuck risk)

Where it lives: `/groups/[slug]` for admins, `/groups/[slug]/organizer`, create-event flow, event detail.

1. **Start a group**: apply at `/groups/apply`, goes to an admin approval queue, you become group admin on approval. Explain the "pending" wait so people do not think it failed.
2. **Host your first event**: Host Event, place/time, logging mode choice, join code, cohost groups, optional planned route.
3. **Pick a logging mode** (the most confusing choice): organizer total (you log one haul, points split equally) vs individual (each attendee self-logs). Include the warning that re-submitting a team total wipes and re-splits.
4. **Running the day of**: check-in (GPS vs 6-character join code), manually add or check in attendees, promote co-organizers, "Log for them".
5. **After the event**: log team total, organizer dashboard nudges (schedule next event, log missing metrics).
6. **Managing members**: promote/demote, sole-admin limits, delete group blockers.

Suggested form: one walkthrough ("Run a group") with 6 to 8 steps, plus a "?" next to the logging-mode picker that opens only the step for it. Trigger on first visit to the group admin view.

### P1: Partner business

Where it lives: `/partners/apply`, `/partners/dashboard`, `is_business_only` accounts land on the dashboard directly.

1. **Apply**: guest can fill the form, sign-in needed to submit (form is preserved), approval wait, then dashboard access is automatic.
2. **Set up your listing**: logo, hours, location picker, links.
3. **Create an offer**: spend vs threshold mode, cost, max per user, active window, optional location restriction.
4. **What a redemption looks like**: customer shows a code, you mark it used. This is the key step for staff who have never seen the app.
5. **How customers find you**: map pin or logo, points required.

Business users are the least app-literate group and `is_business_only` accounts skip the normal map, so this one is the most valuable for support load. Needs a version that works as a standalone sheet in the dashboard (and ideally a one-page printable for staff, tied to the partner overview doc).

### P2: New individual, other campaigns

- **Touch Grass / Solarpunk**: port the old grid instructions to the generic walkthrough so every campaign has the same first-visit experience. Content depends on each campaign's rules.
- **Account and profile basics**: sign up, username, avatar. Probably folded into `OnboardingModal`, not its own walkthrough.
- **Points and rewards, deeper**: how points convert, spendable vs lifetime, redeeming code at a shop. Overlaps with `/how-points-work`; link out rather than duplicate.

### P2: Decision-point tips (inline "?", not full walkthroughs)

From the onboarding scoping doc, these need a one-card explainer, not a stepper:
- Points basis picker (bag count vs granular bag types vs pounds vs countable items, and why bases 2 to 4 need a photo).
- Organizer total vs individual event logging (also covered in the organizer walkthrough).
- Geographic stats layers vs territory toggle; zip leaders toggle.
- Claim-a-report (Beta): timers, GPS-gated before/after photos.
- Route mode (Beta): draw vs live track.

### P3: Site admin

Admin panel is used by one or two people who already know it. Lowest priority. A short "admin cheat sheet" in `dev-docs` is probably enough rather than in-app UI. Revisit if more admins are added.

### Also worth covering (things not on the earlier list)

- **Event attendee path**: browse group, RSVP, check in (GPS vs code), self-log. Currently only touched by one Trash War step.
- **Notifications and push permission prompt**: explain why before the OS prompt appears (matters for iOS opt-in rates; see push notification docs).
- **Location permission**: a pre-prompt explaining why GPS is needed for check-in, claim-a-report and "Log here". Failed or denied location is probably the top stuck point and the geolocation owner refactor is already deferred.
- **Empty states** (Mine, Activity, new group, new profile) that say what to do next. These are small and have outsized impact; they are cheaper than walkthroughs and should ship alongside them.
- **Native app specifics** (Capacitor): sign-in via browser handoff, permissions, what to do if a link opens in the browser instead of the app.

## Content principles (match the Trash War one)

- Mobile first, one idea per step, 4 to 11 steps max.
- Title + one sentence + at most 4 numbered actions. Real button labels in the how-to text, matching the UI exactly.
- Visual is a mock of the actual control (pill, chip, pin), not a screenshot, so it never goes stale.
- Mark Beta features with the Beta badge.
- No em dashes in any copy.
- Every walkthrough reopenable from a visible "?" and never auto-shown twice.
- Verify each step against the live flow before shipping (Trash War still has unverified items: Routes step wording "choose Route", shop-logo claim on reward pins, random bonus spots not covered).

## Suggested order

1. Extract generic `Walkthrough` + hook + trigger; convert Trash War to use it (no behavior change).
2. Partner business walkthrough (dashboard).
3. Group organizer walkthrough ("Run a group").
4. Location and notification pre-prompts.
5. Empty states.
6. Inline "?" tips at decision points.
7. Port Touch Grass / Solarpunk.
8. Measure: simple events on open, step reached, completion, skip (ties into onboarding Phase 3 tracking) to decide what else is worth building.

## Open questions

- Should walkthrough progress or "seen" state live server-side (`profiles`) rather than `localStorage`? Matters for app reinstall and multi-device; `localStorage` is fine to start.
- Do business-only users want a printable/staff version?
- Content ownership: who reviews copy for accuracy when features change? Suggest adding "update the walkthrough" to the checklist next to the capability doc update rule.
- Any of this in the Capacitor release bundle, or web-only first? Walkthroughs are pure frontend so they ship via the remote-URL wrapper without a store release.

## Status (2026-10-15)

- [x] Step 0 generic component (`components/walkthrough/`, registry `src/walkthroughs/index.tsx`)
- [x] Partner business (`partner`)
- [x] Group organizer (`organizer`)
- [x] Event attendee (`attendee`)
- [x] Permission pre-prompts: notification primer, plus location-denied recovery card on check-in. Native app quirks walkthrough was dropped (not for normal users); camera and other location callers are not wired to the recovery card yet
- [x] Empty states (own activity list, My Groups)
- [~] Inline tips: logging mode (both event forms) and redemption mode done. Not done: points basis, geo stats vs territory toggle, zip leaders, route mode
- [x] Other campaigns (`touch-grass`, `solarpunk`; behavior change: they now stay dismissed after the first close)
- [x] Site admin: triggerable "Admin guide" link in the Admin Panel header (`admin`), one step per tab
- [ ] Analytics (step reached, completion, skip)
