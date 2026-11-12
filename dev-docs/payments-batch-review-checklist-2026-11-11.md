# Payments batch: review checklist and feedback (2026-11-11)

Everything below is built locally on branch `money-and-payments`, uncommitted. Migrations 139 to 143 are applied to the local DB only (never run on prod from here). Source scoping doc: `payments-meeting-notes-scoping-2026-11-10.md`.

Use this as the list for a full pass through every flow. Tick each item as you review it.

## The nine changes

- [ ] **1. Earn/Hire tab split.** Hire = jobs and sponsorships (including pools). Earn = cleaning for pay. Impact stays its own tab.
  - Files: `components/marketplace/MarketplaceNav.tsx`, `MarketplaceHome.tsx`, `HideOnHome.tsx`, `app/marketplace/page.tsx`, `app/sponsorships/page.tsx`, `SponsorshipsPanels.tsx`, `walkthroughs/marketplace.tsx`, `funding.tsx`
  - Check: nothing from the old combined view is missing, no stale links.
- [ ] **2. Mandatory live route tracking (native app only).** Route recorded only during the cleaner's own in-progress job. Readable by that cleaner and admins. Finishing without a route is allowed via an override that flags the job for admin review.
  - Files: migration `141_marketplace_job_tracking.sql`, `backend/app/services/marketplace.py` (`add_track_points`, `get_track`, `complete_job`), `lib/useJobTracker.ts`, `JobRouteCard.tsx`, `JobDetail.tsx`
  - Check: flag hidden from everyone but the cleaner and admins. Least tested item, try on a real device.
- [ ] **3. Time tracking (arrival to finished photo).** Minutes on site from `started_at` to `completed_at`. Admin "Route review" list shows flagged jobs, cleaner, minutes, reason.
  - Files: `services/marketplace.py` (`admin_overview`), `AdminPanel.tsx`
  - Check: query runs locally but has not seen a real flagged job.
- [ ] **4. End photo plus "all bags are in the photo" prompt.**
  - Files: `JobDetail.tsx`, `CleanerFlow.tsx`, migration `139_marketplace_bags_and_dropoff.sql`
  - Check: prompt wording, snow jobs skip it.
- [ ] **5. Optional "OK to leave bags at my house".** Drop-off address hidden from non-participants.
  - Files: `JobForm.tsx`, `JobDetail.tsx`, migration 139, `services/marketplace.py`
- [ ] **6. Required cleaner profile photo and fuller profile.** 9-item completeness meter, extra fields, badges on the public profile.
  - Files: `CleanerOnboarding.tsx`, `app/marketplace/become-a-cleaner/page.tsx`, `app/marketplace/cleaners/[id]/page.tsx`, migration `140_cleaner_profile_details.sql`
  - Check: badge thresholds are guesses (4.7+ with 3+ ratings, 10+ jobs, 1 to 9 jobs).
- [ ] **7. Tax and ID groundwork (Stripe-hosted).** Agreement v3 for cleaners and customers plus onboarding copy. Frontline stores no ID images or full tax numbers.
  - Files: migration `143_marketplace_agreements_v3.sql`, `CleanerOnboarding.tsx`
  - Check: wording is "DRAFT FOR LEGAL REVIEW". Needs counsel before shipping.
- [ ] **8. Snowshoveling as a hire activity.** Area chips (Driveway, Sidewalk, Steps, Walkway, Car) and a salt option, stored as description text only.
  - Files: `JobForm.tsx`, agreement v3 snow clauses
  - Check: snow jobs stay out of points and Trash War scoring (not verified yet).
- [ ] **9. Pooled money for sponsored sites.** One person starts a pool, others add via Stripe Checkout. Platform holds the money until the goal is met, then creates ONE funded site sponsorship. If the goal is missed or the creator cancels, every contribution is refunded.
  - Files: migration `142_sponsorship_pools.sql`, `services/sponsorship_pools.py`, `routes/sponsorship_pools.py`, `routes/payments.py` (webhook), `app/sponsorships/pools/`, `components/sponsorships/`, `lib/sponsorshipPools*.ts`, `app/api/sponsorship-pools/`
  - Check: run checkout and refunds in Stripe test mode. Only smoke-tested locally without real Stripe calls.

## Not tested yet
- Route recording and the "finish without route" gate.
- Pool checkout and refunds against Stripe.
- New pages and agreement v3 acceptance in the UI.

## Sample data
- `POST /api/admin/seed/marketplace?fresh_brooklyn=true` adds four open Brooklyn jobs dated today (including a snow job). Older seeded jobs expire after 14 days. Logins `mk_maria`, `mk_devon` etc. use password `password`.

## Feedback from first look (2026-11-11), not built yet

1. **Earn landing map.** Show a map of everything in the ecosystem, both sponsored sites and jobs. There is not room for both lists, so add a toggle or better flow between them.
2. **Payouts card too big.** Make a condensed version the user can expand to see the link buttons.
3. **Two cards, not three.** Drop from three (take a job, cleaner profile, my jobs) to two. Put "My jobs" as a link inside the profile.
4. **Admin under "What do you want to do".** Question: only shown to admins? What do non-admins see, is the section gone?
5. **Blue "update payment info" text on the jobs pages.** Why is it there? Keep it consistent with the sponsor version of the Earn page.
6. **Icon alignment and mobile.** Make icons line up on the action cards. Earnings and payment info look bad on mobile.
7. **Job type filters on one line.** "Snow" now wraps to its own line.
8. **Pools question.** Is a pool a whole separate thing? Can an existing sponsored site be added to? Idea: let a sponsor choose whether their sponsorship can be added to (for sole credit), a toggle that defaults to on.

### Follow-up decisions and clarifications (same day)

8 (revised). **Three funding types are needed**, not one:
   1. A sponsored site or area that others CAN add onto. Needs clear language plus visibility on the maps (including the main Trash War map) to encourage adding. Likely the default (toggle on).
   2. A sponsored site or area that others can NOT add onto (sole credit).
   3. The new pool mechanic, positioned as community crowdfunding for much larger projects. Encourage people to start from a regular site or area so some money is already pledged and others can add to it.

4 (answered). The "What do you want to do?" chooser on the sponsored part of the Earn page exists. It should be hidden for non-admins, since with only one option left it makes no sense. Show it only when an admin has more than one choice.

9. **Plain-language guides in the app.** Users must understand the functional difference between sponsoring sites and groups versus the hire marketplace (paying a neighbor to do a job). Update FlowGuide walkthroughs and in-page copy accordingly.

10. **Rename the Hire tab.** "Hire" no longer fits now that the tab both creates jobs and sponsors sites, areas and pools. Pick a new name (candidates: Fund, Pay, Sponsor). Update nav, walkthroughs, capability doc and copy together.

## Status of the 10 feedback items (built locally, uncommitted, unviewed in a browser)

1. Done: Earn page has a "Sponsored sites | Neighbor jobs" toggle (jobs embedded from the board). Each view keeps its own map. A single combined map of both is NOT built.
2. Done: payouts card is condensed and expandable.
3. Done: two action tiles; "My jobs" is a link row inside the cleaner profile page.
4. Already satisfied: the chooser shows only when more than one option exists (admins).
5. Done: blue payment text removed, matches the sponsor version.
6. Done (type-checked only): icon alignment and mobile layout. Check on a phone.
7. Done: job type filters on one line (5 columns).
8. Done: migration 144 (`open_to_additions`, `topup_of`, local DB only). Sponsor toggle "Let neighbors add to this" (default on), "Add money to this" on cards and map popups (`/sponsorships?add=<id>` opens the box), "+" on open site markers and a legend line, pools reworded as community crowdfunding. Not tested against real Stripe: top-up checkout, webhook and refund.
9. Done: new Fund tab explainer card (sponsor vs hire, three funding types), two new steps in the funding walkthrough, updated hiring walkthrough.
10. Done with placeholder "Fund" (constant in `lib/rewardsLabels.ts`). Admin-facing settings text still says "Hire". Confirm the final name.

## Layout pass (maps first, guided)

- Earn (`/sponsorships`) and Fund (`/marketplace`) now put the map directly under the tabs (`SponsoredMap compact`, about 52vh, no section header) so it is visible on load.
- Earn order: header, tabs, sites/jobs toggle, map, action tiles, payouts card, guide card, site list. Secondary cards pass into `SponsorshipsPanels` via the `extras` prop.
- Fund order: header, tabs, map, admin link, action tiles, crowdfunds, guide card, "Sponsor a site or area".
- The "What do you want to do?" chooser is gone; admin tools are a collapsed "Sponsorship admin" section on Earn.
- Not viewed in a browser yet. Check on a phone that the map shows without scrolling.
- Earn map is now combined: sponsored sites and areas plus open jobs (sky price pills, amber for your own). Filter chips All / Sponsored / Jobs sit above it. Tapping a job pin shows a card with "View job". The Jobs filter shows the job list below the map (list-only, no second map). Not viewed in a browser yet.
- Route rename DONE: Earn is `/earn` (cleaner profile `/earn/profile`), Fund is `/fund` (jobs, cleaners, post, admin, pools). Old paths (`/sponsorships`, `/marketplace/...`, `/marketplace/board`) redirect with 307, so emails, Stripe returns and shipped mobile builds keep working. The separate "Take a job" page is gone (`/earn?do=jobs`). Backend notification links and Stripe return URLs use the new paths; deploy the frontend first. API proxy routes (`/api/marketplace`, `/api/sponsored`) are unchanged.
- Chooser: both pages have a "What do you want to do?" chip row under the map (`DoChooser`). Earn chips: Take a job, Claim a site (set map filter and `?do=`), My profile, My jobs (links). Fund chips: Post a job, Browse cleaners, My bookings, Sponsor a place, Crowdfund, Moderation (admins). The All/Sponsored/Jobs filter, basemap switcher and Layers button are smaller. Map attribution control removed, Layers panel contained in the map, price-pin tip centered on its anchor.
