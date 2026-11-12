# Payments meeting notes: scoping (2026-11-10)

**Status: scoping only, nothing built.** Source: notes from the meeting that walked through the new payment screens. Each item below has what exists today (checked in code), the gap, a proposed approach and open questions. Related: `paid-cleaner-marketplace-scoping-2026-10-22.md`, `live-route-tracking-scoping-2026-08-22.md`, `payments-admin-guide-2026-11-01.md`, `granular-bag-tracking-scoping-2026-09-02.md`.

Raw notes:
1. Consolidate Earn and Hire tabs into two user flows: people who want to make money vs people who want to hire and sponsor sites.
2. Mandatory live route tracking during a job. The cleaner sees their route on the job page, and admins see it.
3. Mandatory time-of-job tracking, from arrival check-in to submission of the finished photo.
4. Double check the end photo is required, and add a prompt to make sure all bags cleaned are in the photo.
5. For people adding a job, an optional "ok to leave bags at my house" setting.
6. Cleaner profile picture required, and flesh out the cleaner profile.
7. Start the legal portion to prepare for tax forms and capture ID photos.

Suggested order: 4 (small, mostly verification), 3, 5, 6, then 2, 1 and 7 (largest, need decisions).

---

## 1. Two user flows instead of Earn and Hire tabs

**Today:** `RewardsTabs.tsx` has four tabs: Perks, Earn (`/sponsorships`), Hire (`/marketplace`), Impact (`/impact`). Hire is hidden unless `paymentsVisible` and `marketplace_enabled` pass. "Earn" is sponsored-site cleanups; "Hire" is the marketplace (post a job, browse cleaners, become a cleaner). Both mix the money-maker and the money-spender roles, so a cleaner and a sponsor each have to hunt across tabs.

**Gap:** the split is by feature, not by what the user wants to do.

**DECIDED 2026-11-10:** keep four tabs: Perks, Earn, Hire, Impact. Impact stays its own tab. Everything about sponsorships and jobs stays reachable, but it is split by intent across the Earn and Hire tabs:
- **Earn tab (make money):** sponsored sites to claim, open jobs on the board, my active job, my earnings and payout setup, my cleaner profile, agreements and tax info.
- **Hire tab (pay people to clean and sponsor things):** post a job, my bookings, cleaner directory, sponsor a site, pooled funds (item 9), my sponsorships.
- Routes can stay as they are (`/sponsorships`, `/marketplace`); the change is which screens and sections each tab shows. A user can be both, so nothing is role-locked.

**Still open:**
- Which bottom tab holds this on mobile (open item in the scoping doc section 14)?
- Walkthrough guides (`funding`, `marketplace`, `impact` in `frontend/src/walkthroughs/`) need re-pointing to the new structure.

---

## 2. Mandatory live route tracking during a job

**Today:** no tracking on marketplace jobs. Location is only checked at two points (`_check_on_site` in `backend/app/services/marketplace.py`, at start and finish, within `marketplace_site_radius_m`, default 150 m). A separate live-route scoping doc exists for free cleanups (native-only background tracking via `@capacitor-community/background-geolocation`, writes a LineString to `cleanups.route`), also not built.

**Gap:** a tracked path for the job, visible to the cleaner on the job page and to admins.

**Proposal:**
- Start tracking when the cleaner checks in (`start_job`), stop when they mark complete. Reuse the background-tracking approach and plugin choice from the live-route doc so we do it once.
- Storage: new table, for example `marketplace_job_track_points` (job_id, lat, lng, accuracy, recorded_at), or a batched LineString per job plus raw points. Batch uploads from the device every N seconds and keep a local queue for poor signal. Needs a migration (local only; applying to prod is the user's job).
- API: `POST /api/marketplace/jobs/{id}/track` (append points, cleaner only), `GET .../track` (cleaner, the customer if we allow it, and admins).
- UI: map on `jobs/[id]` showing the live line for the cleaner; admin job view shows the track plus stats (distance walked, duration, time off-site). Existing `JobSiteCard` is the natural place.
- "Mandatory": `complete_job` requires a track with some minimum coverage, or an explicit flagged override like the current "My location is wrong" path (sets `location_flagged`). Never a silent block, so a dead phone does not strand a cleaner without pay.

**DECIDED 2026-11-10:** native app required. Web cleaners can browse and accept jobs but must open the Android or iOS app to start one.

**Open questions:**
- Does the customer see the route, or only the cleaner and admins (notes say cleaner and admins)? Privacy: show it to the customer only after completion, if at all.
- Retention period for location data, and disclosure in the privacy policy and cleaner agreement.
- Store and review cost: Play background-location declaration and App Store "Always" location scrutiny apply (see live-route doc). Payments release should account for this timeline.
- Battery and sampling interval.

---

## 3. Mandatory time-of-job tracking

**Today:** `marketplace_jobs.started_at` is set in `start_job` (requires a before photo and an on-site check) and `completed_at` in `complete_job` (requires an after photo and an on-site check). So the duration is already derivable, and it is effectively mandatory because the flow cannot proceed without both.

**Gap:** it is not surfaced, not stored as a duration, and arrival is conflated with start (arrival check-in is only recorded when the before photo is submitted). Hourly jobs (`price_type = 'hourly'`) need a trusted duration.

**Proposal:**
- Treat `started_at` as the arrival check-in and `completed_at` as the finish-photo submission, and say so in the UI. Show a running timer on the active job and the final duration on the completed job, for the cleaner, customer and admin.
- Add `duration_seconds` (or compute on read) and guard against clock tampering by using server timestamps only (already true: `now()`).
- If a separate "arrived" moment is wanted before work starts, add `arrived_at`. Probably unneeded: one check-in is simpler.
- For hourly jobs, compute pay from tracked duration (capped by the customer's max), which ties into the Connect payout work.
- Pair with item 2: time off-site during the window can be flagged.

**Open questions:**
- Cap on duration, auto-flag for jobs that are suspiciously short or long compared to the size estimate?
- Does the clock pause for breaks, or stay simple (no pause)?

---

## 4. End photo required, plus "all bags are in the photo" prompt

**Verified today:** the after photo is already required in two places. Backend `complete_job` rejects with "Add at least one after photo before marking the job complete." (counts `after` photos by this cleaner), and the `CleanerFlow.tsx` checklist item "After photo" gates the finish button (`done={after.length > 0}`). The before photo is also required in `start_job`.

**Gap:** no prompt about the bags, and the job has no bag count to compare against. The marketplace job form has `size` (small, medium, large) and no bag field.

**Proposal:**
- In `CleanerFlow.tsx`, before taking or submitting the after photo, show a short confirm step: "Lay out or stack every bag you filled so they are all visible in the photo" with a checkbox "All bags are in this photo". Submit disabled until checked. Store the acknowledgement (`bags_ack` timestamp on the job or in the photo row) so disputes can reference it.
- Optional bag count entered by the cleaner at finish (ties to `granular-bag-tracking-scoping-2026-09-02.md`), so a reviewer can count bags in the photo against the claim.
- Backend enforces the acknowledgement in `complete_job`, not just the UI.
- Tip text in the photo hint: wide shot, bags side by side, site visible.

**Open questions:** collect a bag count at all (needed for the "leave bags at my house" feature below to say how many bags to expect)?

---

## 5. Optional "ok to leave bags at my house" on job posts

**Today:** nothing. `JobForm.tsx` and `create_job` have no disposal or drop-off field.

**Proposal:**
- New optional field on the post-a-job form: "It is ok to leave full bags at my home" (off by default). If on, collect a bag drop-off address or instructions (private, shown only to the accepted cleaner after acceptance, like the exact site address today) and a free-text note (for example "left side of the porch, not before 8am").
- Columns on `marketplace_jobs`, for example `bag_dropoff_ok boolean default false`, `bag_dropoff_address text`, `bag_dropoff_note text`. Visible to participants only; the board card shows a small "Bag drop-off available" pill so cleaners know disposal is solved.
- Cleaner side: show the drop-off details on the active job and use them for a "bags dropped off" step (optional photo).
- Hazard and legal wording: require the customer to confirm they consent, and exclude hazardous materials (already in the customer terms).
- The duplicated-form rule in memory applies to cleanup event forms, not this, but check `JobForm.tsx` for any second copy of the form before editing.

**Open questions:**
- Drop-off at the customer's home only, or also businesses and designated drop sites?
- Does the cleaner have to confirm the drop-off with a photo (proof of disposal)?

---

## 6. Cleaner profile: required picture, fleshed out

**Today:** `cleaner_profiles` has headline, bio, services, rate, service radius, area label, status, rating and jobs completed. The 2026-10-22 decision log already says "Cleaner profile photos: required", but `CleanerOnboarding.tsx` does not appear to reference any photo field (grep for photo, avatar and headshot found nothing), so it is likely not enforced. Verify against `upsert_cleaner_profile` and where avatar lives (probably `profiles`).

**Proposal:**
- Required profile photo: block publishing (status `active`) and accepting jobs without one. Reuse the existing avatar upload and R2 pipeline, including the HEIC handling. Prompt: clear face photo, no sunglasses. Consider a manual or automated face check later.
- Fleshed-out profile fields to consider: display name, short intro video or longer bio, languages, years of experience, equipment owned (grabber, gloves, truck), services and job types, availability (days and hours), service area map, preferred job size, photo gallery of past work (pull from completed jobs' after photos with customer OK), verified badges (ID verified, agreement signed, background check later), stats (jobs done, rating, on-time rate, total hours, tracked distance), and reviews.
- The profile page (`/marketplace/cleaners/[id]`) gets a hero layout with photo, badges and stats; the edit screen groups fields in steps with a completeness meter.

**Open questions:** which of the extra fields are launch-critical vs later? Do we show real names or usernames publicly?

---

## 7. Legal portion: tax forms and ID photo capture

**Today:** agreements exist (migration 121, bumped in 128): cleaner and customer click-through agreements with versioned acceptances and a type-your-legal-name step, plus an 18+ check. Stripe Connect (payouts, identity check, 1099 handling) is planned but not built. The scoping doc (section 13) says: "Background-check and ID data is sensitive, so store only vendor results, not raw documents."

**Conflict to resolve:** the new note says "capture id photos". That contradicts the earlier decision to avoid holding raw ID documents. Holding our own copies of government IDs makes us the custodian of highly sensitive data (breach liability, retention rules, encryption, access logging).

**DECIDED 2026-11-10:** Stripe-hosted ID and tax capture. We store only status and Stripe ids, never the images.

**Recommendation (adopted):** use a verification provider rather than building ID photo storage ourselves:
- **Preferred:** Stripe Connect Express onboarding (collects legal name, DOB, address, SSN or EIN, bank, and does KYC) or Stripe Identity for the ID and selfie capture. Stripe stores the documents; we store only the status and a verification id. Stripe can also file 1099-K or 1099-NEC depending on setup and collects the W-9 style tax info. This delivers "prepare for tax forms and capture ID" with the least risk.
- **If we must store photos ourselves:** private R2 bucket (not public), server-side encryption, short signed URLs, admin-only access with an audit log, strict retention, and counsel sign-off. Needs a separate migration and a purge job. Not recommended.

**Proposed build (phased):**
1. A "Get paid" onboarding step in the make-money flow: legal name, DOB, address, tax classification, then a Stripe Connect or Identity handoff. Cleaners cannot accept jobs above $0 or receive payouts until verified.
2. A tax-info status surface for admins (who is verified, who is missing info, year-to-date earnings per cleaner against the 1099 threshold). Keep totals in our DB for reconciliation.
3. Agreements: confirm the cleaner agreement covers contractor status, taxes and ID verification consent, and add an electronic-records and tax-form consent (e-delivery of 1099) and a data-use and location-tracking consent (ties to item 2).
4. Counsel and accountant review before anything real launches: 1099 thresholds, state requirements, backup withholding, whether sponsored-site claimants need the same agreement and tax collection (recommended yes).

**Open questions:**
- Confirm: Stripe-hosted ID capture, or do we really need our own copies of ID photos? If yes, why (admin disputes, a non-Stripe fallback)?
- Which launch states, and does the platform or Stripe file 1099s?
- Does a sponsor or customer also need tax info (receipts, business accounts)?

---

## 8. Added task: snowshoveling as a hire activity

**Today:** job types are limited to litter, lot cleanup, sidewalk and light yard work (`create_job` allow-list, `JobForm.tsx`, cleaner `services`). Snow is seasonal and different from cleanup: no bags, so the "bags in photo" step and bag drop-off do not apply.

**Proposal:**
- Add job type `snow_shoveling` to the backend allow-list, the form's type picker, the cleaner `services` options and any display label maps.
- Job form variant: area to clear (sidewalk, driveway, stoop, steps), optional "salt or de-ice" add-on, size choices stay small, medium, large.
- Cleaner flow variant: before and after photos still required; the bags prompt is skipped for this type. Time tracking and route tracking apply as normal.
- Safety and legal: add snow-specific wording (ice, slips, shoveling-related injury, de-icing chemicals, property damage) to the customer and cleaner agreements, which need a version bump and counsel review. Winter-only visibility is optional (hide the type outside the season, or leave it available).
- Not a cleanup: keep it out of points and Trash War scoring.

**Open questions:** per-job fixed price or hourly, standing seasonal bookings (recurring is not at launch, see the marketplace doc section 12), and whether sponsors can fund snow clearing for a site.

---

## 9. Added task: pooled funding for sponsored sites

**Today:** a sponsor funds a site themselves (`SponsorshipWidget.tsx`, `/sponsorships`, Stripe-based). One sponsor per funded site; there is no way for several people to chip in.

**Idea:** one person starts a pool for a site, and others can add to it until a goal is reached.

**Proposal:**
- New concept: a sponsorship pool with a target amount, an owner (starter) and contributions from other users. The site is activated for claiming when the pool reaches its target (or when the starter chooses to proceed with what is funded, if allowed).
- Contributions: each is a separate Stripe payment tied to the pool, recorded as held funds until the target is hit. If the pool does not fill by a deadline, contributions are refunded in full.
- Visibility: pool page and card show progress bar, contributors (opt-in anonymity), and a share link so the starter can invite people. Impact tab credits all contributors proportionally.
- Tables (sketch, local migration only): `sponsorship_pools` (site, owner, target_cents, status, deadline) and `sponsorship_pool_contributions` (pool, user, amount_cents, stripe_payment_intent_id, status). Reuse the existing sponsorship and payout path once funded.
- Lives on the Hire tab (sponsor side).

**Open questions:** minimum contribution, whether the starter must put in the first amount, deadline length, what happens to overfunding (extra to the site, or capped), and whether pooled money counts toward any sponsor perks or leaderboards.

---

## Dependencies and order

- Items 2, 3 and 4 all change the cleaner's active job flow (`CleanerFlow.tsx`, `start_job`, `complete_job`), so build them as one batch with one migration, tested together on a device.
- Item 7 and the Connect payout work are linked (money moving needs verification first). Item 6's verified badges depend on item 7.
- Item 1 is navigation only and can ship independently, ideally with the mobile release bundle (see mobile release rules: bundle mobile releases, do not break prod).
- All of it stays behind the existing payments gate (`paymentsVisible` plus `marketplace_enabled`), admin-only until launch.

## Build status (local only, uncommitted; migrations 139-143 not applied to prod)

| Item | Status |
|---|---|
| 1. Earn/Hire split | Built. FlowGuide walkthroughs re-pointed. |
| 2. Route tracking | Built (native-only, cleaner and admins read the route, override flags the job). |
| 3. Time tracking | Built. Admin "Route review" list shows flagged jobs and minutes on site. |
| 4. End photo + bags prompt | Built. |
| 5. Leave bags at my house | Built. |
| 6. Cleaner profile | Built. Photo and profile completeness meter, badges on the public profile. |
| 7. Tax and ID (Stripe-hosted) | Built as agreement v3 (migration 143, draft wording for legal review) plus Stripe-hosted Connect Express onboarding copy. No ID images or full tax numbers stored by Frontline. |
| 8. Snowshoveling | Built. Snow area chips, salt option and agreement wording. |
| 9. Pooled sponsorship | Built (migration 142, service, routes, webhook routing, pages on the Hire tab). Pool lifecycle smoke-tested locally with no real Stripe calls. |

## Next steps

1. Decisions made 2026-11-10: native-only tracking (2), Stripe-hosted ID and tax (7), four tabs kept with Earn and Hire split by intent and Impact separate (1). Work proceeds on all items together.
2. Break each item into a branch and update `campaign-app-scope.md` and `app-capability-doc.md` as features ship.
