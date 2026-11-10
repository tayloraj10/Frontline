# Paid cleaner marketplace: scoping (2026-10-22)

**Status: scoping only, nothing built.** Idea: a Rover or Care.com style marketplace where businesses and residents hire cleaners for pay. It is a separate portal or campaign from the points-based cleanup groups, not a change to them.

Original ask: "mock up a similar UX to Rover where businesses and residents can request cleaners for pay, and/or like Rover and Care.com where individuals can list themselves for hire at their desired rate."

## 1. Two directions (can ship one first)

- **A. Request board (customer posts a job):** a resident or business describes a job (address or pin, what needs cleaning, size, date, budget). Cleaners nearby see it and offer to take it or quote.
- **B. Cleaner directory (cleaner lists themselves):** a cleaner has a profile with photo, bio, service area, services, hourly or per-job rate, availability and reviews. Customers browse the map or list, message, and book. This is the Rover and Care.com model.
- They share the same booking, payment, review and dispute machinery, so the real build is that shared core. Decided: plan both. Suggested build order: B first (simpler to launch, supply-led), A right after.

## 2. Roles

- **Customer:** resident or business (partners already exist as businesses).
- **Cleaner:** any user who opts in and completes onboarding (profile plus payout setup).
- **Admin:** moderation, disputes, refunds, fee settings.
- A user can be a customer, a cleaner, or both.

## 3. Core flow (direction B)

1. Cleaner onboarding: profile, service types, area, rate, photos, Stripe Connect onboarding (identity check and bank or debit card).
2. Customer searches the map or list, opens a profile, sends a booking request with date, location, scope and the quoted price.
3. Cleaner accepts or declines (or counter-offers).
4. Customer pays at acceptance. The platform holds the funds.
5. Job happens. Cleaner marks complete, with before and after photos (reuse the cleanup photo flow).
6. Customer confirms, or the payment auto-releases after N days with no dispute.
7. Funds go to the cleaner minus a platform fee. Both sides leave a review.

## 4. Money flow

- Stripe Connect Express accounts for cleaners (hosted onboarding, KYC, payouts to bank or debit card). This is the same Connect work already listed as not built in the payments v2 doc, so this idea and sponsored-cleanup payouts should share it.
- Charge the customer through the platform (Checkout or PaymentIntent), hold, then transfer to the cleaner on completion. Stripe's "separate charges and transfers" model fits a hold-then-release flow.
- Platform fee: percentage of each job (Rover charges both sides). Number to decide.
- Refunds, cancellations and no-shows need clear rules (cancel window, partial refund, cleaner no-show).
- Tips optional.
- Tax: cleaners earn income, so we would issue 1099s above the threshold (Stripe can handle much of this on Connect). Needs a tax and legal check.
- Not a points system. Real money only, kept out of the points economy and leaderboards.

## 5. Trust, safety and legal (largest risk area)

- Cleaners entering homes and businesses: ID verification at minimum, optional background checks (third party such as Checkr), reviews, report and block.
- Insurance and liability: who covers damage or injury. Likely a terms-of-service position plus possibly a platform policy. Needs legal advice.
- Worker classification: cleaners must be independent contractors, so we set rules (they set rates, accept or decline freely) and do not manage how they work.
- Local rules: some cities need licenses for certain services (junk removal, hazardous waste, pest). Restrict allowed service types at launch.
- Disputes: admin review with photos and messages as evidence.
- Messaging: in-app only, with contact details hidden until booking, to reduce off-platform deals.

## 6. App store

- Real-world services paid for outside the app are not digital goods, so Stripe is the normal route. This avoids the Plus subscription in-app-purchase question (see the open decision in `payments-v2-scoping-2026-10-15.md`). Verify current Apple and Google policy before launch.

## 7. How it fits the existing app

- Separate portal or campaign, with its own entry point, so it does not mix with free group cleanups and points.
- Reuse: profiles, maps (MapLibre), partners and business records, photo upload to R2, notifications and email, admin tooling, and the payments gating pattern (`payments_admin_preview` then a new `marketplace_*` flag, admin-only first).
- New: cleaner profiles, listings or job requests, bookings, messaging, reviews, availability, dispute tools, Connect onboarding.

## 8. Mockup plan (decided 2026-10-22)

- "Mockup" here means this planning doc, not clickable pages. The build comes next and is refined iteratively, behind an admin-only flag first.
- **Decided:** cover both directions (A request board and B cleaner directory) on shared booking, payment and review machinery. Launch customers are both businesses and residents.
- Screens to plan when building: marketplace home (map and list toggle), cleaner profile, booking request, bookings list for both sides, cleaner onboarding and listing editor, post-a-job form, job board, review screen, admin disputes. Mobile-first.

## 9. Suggested phases

1. Planning doc (this doc), then a first build behind an admin-only flag with fake data and no money moving.
2. Validate with 3 to 5 real cleaners and customers (like the supply stations Phase 0).
3. Legal and tax review, Connect onboarding.
4. Direction B build: profiles, booking, payment hold and release, reviews.
5. Direction A and extras: job board, background checks, insurance, tips.

## 10. Open questions

- ~~Direction?~~ Decided: both. ~~Launch customer?~~ Decided: businesses and residents.
- What counts as a "cleaning" service at launch (litter pickup, sidewalk and lot cleanup, graffiti, yard work, hauling)?
- Platform fee percent, and who pays it (customer, cleaner, or split).
- Who handles liability and insurance, and do we require background checks?
- Where does it live: a separate campaign inside the app, or a distinct section or domain?
- Launch geography (NYC only first?) and any city license limits.
- Is the cleaner supply the existing volunteer community, or new paid cleaners (affects messaging and the points question)?

## 11. Booking time options (decided 2026-10-22)
Three ways to say when, chosen on the booking request and the post-a-job form (three-way segmented control):
1. **Specific time:** exact date and start time. Cleaner accepts or declines. Simplest, easiest to spot no-shows.
2. **Window:** a date range ("any time Sat to Sun", "Oct 31 to Nov 3, mornings"). Cleaner accepts, then proposes the exact slot inside the window. Default option.
3. **Flexible:** "within the next N days", capped (about 14). Low urgency, cleaner slots it in when nearby. Expires at the cap and any hold is released. Not truly open-ended: open jobs sit unclaimed and tie up money.

Consequences:
- Request board: Flexible jobs fit best as open jobs any cleaner can grab. Specific and Window fit direct bookings better.
- Pricing: Specific and Window can be hourly or fixed. Flexible leans fixed price.
- Payment: the hold starts at acceptance, never at request, for all three. Auto-release after N days with no dispute is the same for all three.
- Cleaner side: request cards show the option as a pill (Exact, Window, Flexible) and cleaners can filter by it.
- Later, not launch: urgency premium for Specific, discount for Flexible.

## 12. Recurring bookings (under discussion 2026-10-22)
Goal: spread the money around and give more people a chance to clean, not lock one cleaner in.
Recommendation:
- **Launch: no recurring.** One-off bookings only, until the one-off flow, payouts and disputes are proven.
- **Later (v2): a recurring request is a series of independent bookings**, each separately held, released and reviewed (never one big hold). Cap the series (for example 4 occurrences), cancel any time before the next one is accepted.
- **Rotation by default:** each occurrence re-opens to the board or directory instead of auto-assigning the same cleaner. A "prefer previous cleaner" toggle is allowed but not the default.
- **Concentration guard (optional):** limit how many consecutive occurrences one cleaner can take, or show lower-earning nearby cleaners first, to spread work. Needs a decision before building.
- Open: does rotation matter more than reliability for customers (businesses will want the same person)? Possibly allow "same cleaner" only for verified businesses.

## 13. Legal and safety gates (added 2026-10-22, needs a lawyer before any real launch)
Not legal advice. These are the product gates we want so counsel has something concrete to review.

**Agreements (click-through, versioned, stored per user with timestamp, app version and IP):**
- **Cleaner agreement and liability waiver, required before a cleaner can accept or be listed.** Covers: independent contractor status, assumption of risk for physical work, release of Frontline from injury and property claims, own responsibility for tools, taxes and local licenses, safety rules (no hazardous waste, sharps, biohazards, no confined or unsafe spaces, no work alone at night), and conduct rules.
- **Customer terms before posting or requesting a job:** accurate description of the site, right or permission to authorize work on the property, disclosure of known hazards, no hazardous materials, payment and dispute terms.
- **Platform terms:** Frontline is a venue, not the employer or contractor; limits of liability; arbitration or venue clause; indemnification. All for counsel to decide.
- Re-accept on any version bump; block accepting jobs until re-accepted. Keep every accepted version.
- A minimum age of 18 for cleaners (the waiver is not enforceable against minors).

**Gating in the app:**
- Cleaner onboarding (mock 8) gets an agreements step before Stripe Connect: read, scroll to the end, check the boxes, type the legal name. Cannot publish a listing or accept a job without it.
- Per-job safety acknowledgement on accept ("I checked the site for hazards and can do this safely"), and a customer-side hazard checklist on the job form.
- Sponsored cleanups today have no waiver. Decide whether the same cleaner agreement should apply to anyone claiming paid sponsored sites, since money and obligation are involved.

**Safety features:**
- ID verification (Stripe Identity or Connect's own identity check) before payouts, optional background check (Checkr) as a badge.
- In-app messaging only, contact details hidden until a booking is accepted.
- Report and block on every profile, booking and message. An admin queue for reports.
- Check-in and check-out photos with timestamps and location, which doubles as dispute evidence.
- Emergency button on an active job (call 911, share location) and a "something is wrong" option that pauses the job and holds the money.
- Job type allow-list at launch (litter, lots, sidewalks, light yard work). Exclude hazardous waste, heavy hauling, pest, roofs and anything needing a license.

**Insurance:**
- Ask counsel and a broker about a general liability policy (and whether a marketplace or gig policy fits), versus requiring cleaners to carry their own for higher-risk work. Cost is a factor in the platform fee.

**Money and tax:**
- Marketplace payouts are 1099 reportable. Stripe Connect Express handles tax info collection and 1099-K or 1099-NEC filing depending on setup, so confirm with counsel and an accountant.
- Sales tax and local business registration rules for the platform: ask an accountant.

**Other:**
- Background-check and ID data is sensitive, so store only vendor results, not raw documents.
- Reviews: only after a completed booking, no deletes by the cleaner, admin can remove abusive ones.
- Apple and Google: user-generated content and in-person services policies need report, block and moderation (already on the list above).

Open: which launch city or cities, who is our counsel, and whether the sponsored cleanups need the same waiver before marketplace work starts.

## 14. Running decision log and open items (keep updating)
Decided 2026-10-22:
- Mocks approved in direction ("all looks fine"), fine-tune while building. File: `mocks/payments-revamp-mocks-2026-10-22.html`.
- Time options: Specific time, Window (default), Flexible (capped about 14 days). See section 11.
- Liability waiver and agreements required before a cleaner can accept jobs. See section 13.

Still open:
- Recurring bookings (section 12): recommendation is not at launch, then a capped series of independent bookings that rotate cleaners; "same cleaner" maybe only for verified businesses.
- Whether sponsored-cleanup claimants must also sign the cleaner agreement (recommended: yes, before Connect payouts go live).
- Launch city, counsel, insurance approach.
- Platform fee percent and who pays it; cancel window; hourly versus fixed toggle.
- Which bottom tab "Hire" replaces on mobile; is Impact a tab under Rewards or under profile.
- Connect payouts: auto-pay on approve or manual release.

## 15. Build status (2026-10-22, nothing committed yet)
Built, local only:
- Migration `supabase/migrations/121_marketplace.sql` (applied to local DB only; applying to prod is the user's job). Adds `game_settings` rows (including `marketplace_enabled`), 10 marketplace tables with RLS and no policies (all access through FastAPI), and draft v1 cleaner and customer agreements (placeholder text, needs counsel).
- Backend: `backend/app/services/marketplace.py` and `backend/app/api/routes/marketplace.py`, mounted at `/api/marketplace`. Covers agreements, cleaner profiles, browse, direct bookings, the open board (first cleaner to take a job at the posted price wins; price flags tell the poster it is too low, migration 124), accept/decline/cancel, start/complete/confirm, disputes, messages, photos, reviews, reports, blocks and an admin overview with moderation actions.
- Frontend: a `/api/marketplace/[...path]` proxy plus `lib/marketplace.server.ts` (access check, secret and acting-user headers). Screens: `/marketplace` (browse cleaners and open jobs), `/marketplace/cleaners/[id]`, `/marketplace/post`, `/marketplace/jobs`, `/marketplace/jobs/[id]`, `/marketplace/become-a-cleaner`, `/marketplace/admin`. "Hire" is the 4th tab in `RewardsTabs`.
- Visibility: `paymentsVisible(gate, isAdmin) && marketplace_enabled == 1`. Same rules as the rest of payments v2 (admin-only while preview is on and payments are not enabled), plus the `marketplace_enabled` game setting must be on, even for admins. It defaults to off. The Hire tab in `RewardsTabs` is hidden unless this passes.

Decisions made while building:
- One booking core: direct bookings start `requested`, board jobs start `open` with offers.
- The hold starts at acceptance; release on customer confirm or auto-release 3 days after completion if undisputed.
- Cleaners need a signed agreement (legal name, 18+ check) and are active on save (manual approval dropped 2026-10-23; admins can still suspend); every accept or offer needs a per-job safety acknowledgement.
- Job types limited to litter, lot cleanup, sidewalk, light yard work. Exact address hidden from non-participants.
- Completing a job requires an "after" photo. Reports, blocks and a dispute queue exist; emergencies point to 911.
- No recurring bookings at launch (section 12).
- The "Mine" tab planned for Sponsorships was dropped: no endpoint exists for a non-admin's own sponsorships.

Update 2026-10-23: offers and counter pricing were removed. Cleaners take jobs at the posted price or flag the price as too low; `marketplace_offers` is now unused. My bookings and Cleaner profile are linked from the user's own profile; the Hire header avatar was removed.

Still to do: Stripe Connect payouts in test mode (money currently only tracked as hold status, no real charge), message notifications (offer and new-job notifications are done, email plus push via user_notifications link_url), customer-side address reveal polish, tests for the marketplace service, mobile bottom-tab placement for Hire, and the open items in section 14.

### 15b. Navigation rework (2026-10-22)

- Marketplace is now the "Hire" tab of the shared Rewards tab bar (`RewardsTabs current="hire"` in `app/marketplace/layout.tsx`), so Perks, Paid cleanups, Hire and Impact are one area with an easy way back.
- The bottom "Rewards" tab stays lit on `/sponsorships`, `/marketplace` and `/impact`.
- Marketplace home leads with a primary "Request a cleanup" button, then My bookings and Become a cleaner / My cleaner profile, plus an admin moderation link. Sub-pages get a "Hire a cleaner" back link instead of the old pill nav.
- Empty states carry CTAs. Routes are unchanged; unification is via the shared tab bar rather than a single merged page.

## Mocks and decisions (2026-10-22)

## Photos, on-site verification and cleaner job flow (2026-10-23, migration 123)

- Flow: accepted (cleaner notified) -> arrive: before photo + GPS check -> in_progress (customer notified) -> after photo + GPS check -> completed (customer notified, `release_after` = now + `marketplace_auto_release_days`) -> customer confirms or auto-release -> cleaner notified "Payment released" -> reviews.
- Location rule: distance is measured to the drawn area, or to the pin minus its radius. Allowed slack is `game_settings.marketplace_site_radius_m` (default 150). Too far or no GPS is a hard block unless the cleaner uses "My location is wrong", which proceeds and sets `marketplace_jobs.location_flagged`. Distances are stored on the job (`check_in_distance_m`, `finish_distance_m`) and on each photo (`distance_m`, lat/lng).
- Photos: kinds listing/before/after/checkin/dispute. Listing photos are customer-only while requested or open, max 4. Uploads use R2 kind `marketplace`.
- Code: `CleanerFlow.tsx` (cleaner UI), `JobForm.tsx` (photo picker), backend `start_job`/`complete_job`/`add_photo`/`_check_on_site` in `services/marketplace.py`.
- Test: reseed (`POST /api/admin/seed/marketplace`), log in as mk_jamal, open the accepted job j7. Needs a phone or browser with location, near Manhattan Ave, Brooklyn, or use the override.
- NOT built: Stripe authorize/capture/Connect payout (money is still only the `hold_status` flag), admin view of flagged jobs beyond the badge.
- Prod: apply migration 123 yourself; redeploy `send-push` if not done.


- Formal mocks for the 4 Rewards pages: `dev-docs/mocks/rewards-area-mocks-2026-10-22.html` (published artifact, private). Awaiting review before implementation.
- Tab names locked: Perks, Earn, Hire, Impact (code label "Paid" becomes "Earn" in `RewardsTabs.tsx`).
- Fee model: one-sided. Cleaner pays a 15% commission, customer pays the posted price with no added fee. Adjustable later.
- Cancel window: free until 24 hours before the job.
- Cleaner profile photos: required.
- How it works: reuse the existing `FlowGuide` pill in each `PageHeader` action. Perks (`rewards`) and Earn (`funding`) exist; new guides needed for Hire (`hire`, plus a cleaner-role `hire-cleaner`) and Impact (`impact`). Register in `frontend/src/walkthroughs/index.tsx`.
