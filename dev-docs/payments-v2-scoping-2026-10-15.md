# Payments v2 Scoping: Frontline Plus, Impact page, Sponsored cleanups (2026-10-15)

**Status: scoping plus in-progress build. Proof of concept, admin-only, not for launch.** Builds on `payments-scoping-2026-08-20.md` and the existing `money-and-payments` branch (master merged in, migrations renumbered 109-113, toggle migration 114). Source for direction: `frontline-maps-money-flow.pdf` (Oct 10 working plan) plus decisions below.

## Decisions locked in

- **Proof of concept.** Take the simplest legal path now; legal/tax review happens before any go-live, not before building.
- **One Stripe account, under Frontline Maps LLC.** All money (subscriptions, donations, sponsorships) lands there. Sponsorships are modeled as payments for a funded cleanup program, not charitable donations, so no tax-deductibility language anywhere in the sponsor flow. Revisit the LLC/Foundation split before go-live (the PDF routes Trash for Cash payouts through the Foundation).
- **Payout rail deferred.** Build everything up to "owed to attendee" (ledger rows, approval, state machine). No Stripe Connect, no real payouts yet. Marking an allocation `paid_out` is a manual admin action for the POC.
- **No manual release as the money mechanism.** A sponsor pays, the money goes into a pool tied to where and how it may be used, and workers are credited on verified work. An admin sign-off in the app is required before any allocation is approved.
- **Restyle to "A · Ink"** (near-black, emerald accent, light mode, 44px touch targets, `PageShell`, `font-display`, mobile-first) for every payment page, existing and new.
- **Everything stays admin-only** behind the visibility toggles until explicitly launched.

## 1. Visibility toggles (DONE)

- `payments_enabled` (migration 113, default 0): off = only site admins see payment surfaces.
- `payments_admin_preview` (migration 114, default 1): when 0, payment surfaces are hidden for everyone including admins.
- Single resolver `paymentsVisible(gate, isSiteAdmin)` in `frontend/src/lib/paymentsVisibility.ts` = `preview && (isSiteAdmin || enabled)`. `getPaymentsGate()` in `gameSettings.server.ts` reads both keys. Backend webhooks are unaffected.

## 2. Frontline Plus (about $5/month, hybrid premium + monthly donation)

- One individual tier. Copy frames it as supporting the cleanup mission, with the premium feature set as a thank-you: `PersonalInsightsCard`, supporter badge, group insights (`PremiumInsightsCard`).
- Reuses existing `subscriptions` table, `POST /checkout-session`, `/webhooks/stripe`, `/portal-session`, `/entitlement`. Changes are pricing config, copy, and a proper plan page (replace the bare `SubscriptionWidget` upsell).
- The plan page also shows data on money earned and impact the app creates, plus partner orgs (shared with the Impact page).
- Open: price ID for the $5 plan (needs a Stripe test Product/Price when we reach setup).

## 3. Impact & Funding page (`/impact`)

- **Money:** total raised (subscriptions + sponsorships), owed to cleaners, paid out, reserved pools. Aggregate only.
- **Impact:** cleanups, bags, participants, hotspots cleaned (reuse existing aggregates).
- **Partners & supporters:** partner orgs, opt-in supporter wall.
- New endpoint `GET /payments/impact-summary`, aggregate-only, no personal data.

## 4. Sponsored cleanups

Money is effectively donated to the app with stipulations on where and how it may be spent, and sits until someone claims it by doing verified work. **No expiry** by default (an optional `expires_at` column stays nullable for later). Two separate paths:

### Path 1: Individual paid cleanups (sponsored site)
Someone puts money up to clean their block, a bad area, or the area around their business. Workers claim the site using a hybrid of the existing trash-report claim mechanic (`problem_reports.py`, migration 037):

1. **Claim:** the user must be within the proximity radius (server-side check, same helper pattern as `_assert_within_claim_radius`, `claim_proximity_meters_*`). One active claim per user; reclaim cooldown.
2. **Starting photo:** posted at the site, proximity re-verified. This starts the work window.
3. **Timed ownership:** the site is the claimer's for a set time to finish. On expiry (lazy, like `_expire_stale_claim`) it reopens to others, with a notification.
4. **After photo:** submitting it moves the work to review.
5. **Team-up (later):** possible mechanic when multiple people show up; out of scope for the first cut but the claim row should not block it (claim participants table later).
6. **Admin review** approves or rejects; approval creates an `approved` allocation owed to the user.

### Path 2: Group paid cleanups (sponsored areas ecosystem)
Sponsors fund an area/program for groups. Groups creating a new event can see sponsored areas and choose to hold the event in one (a picker in `CreateCleanupEventForm.tsx` and the `ContributionPanel.tsx` modal, which must be kept in sync). The group is the payee: **the group just gets paid** and can pay attendees outside the app. In-app splitting can be revisited later.

### Sponsor-configurable rule
At funding the sponsor chooses a payout rule: flat per verified cleanup, per-bag rate with a cap, or equal split among verified attendees (group path). The pool total is the hard ceiling. **Default caps (refine later):** per-user cap per sponsorship and a per-user daily cap (suggested starting values $25 per user per pool, $50 per user per day, tunable in `game_settings`).

### State machine
Sponsorship: `pending_funding -> funded -> exhausted`, plus `refunded`. Allocation: `pending_review -> approved | rejected -> paid_out`.

### Data model (migration `115_sponsored_cleanups.sql`)
- Extend `sponsorships`: `model` (`site` | `group_area`), `payout_rule` jsonb, `cap_per_user_cents`, `remaining_cents`, nullable `expires_at`, site geometry/radius for site model.
- New `sponsorship_site_claims` (modeled on report claims): `sponsorship_id`, `user_id`, `status`, `before_photo_url`, `after_photo_url`, `claimed_at`, `expires_at`.
- New `sponsorship_allocations` (append-only): `sponsorship_id`, `user_id` or `group_id`, `contribution_id`, `amount_cents`, `status` (`pending_review` | `approved` | `rejected` | `paid_out`), `reviewed_by`, `reviewed_at`, `reject_reason`.
- Ledger discipline: approved allocations can never exceed the pool (checked in the approve transaction with a row lock on the sponsorship).

### Verification pipeline
1. **Geographic proximity:** server-side, hard precondition.
2. **Photo proof:** before and after geotagged photos (R2).
3. **Admin sign-off:** review queue under `/admin` with Approve / Reject. Nothing becomes `approved` without it.
4. **Later:** cloud image check (quality and AI-generated detection) feeding a flag into the queue, never auto-approve.

### Payout (deferred)
Approved allocations accumulate as "owed". `paid_out` is a manual admin action. Rail chosen later; the table is rail-agnostic.

## Build order

1. DONE: toggle (`payments_admin_preview`) + single visibility helper.
2. Restyle existing payment surfaces to A · Ink: `/sponsorships`, `SponsorshipWidget`, `SubscriptionWidget`, `PremiumInsightsCard`, `PersonalInsightsCard`, `SupporterBadge`, `/billing/success|cancel`.
3. Frontline Plus plan page + $5 price wiring (needs Stripe test Product/Price).
4. `/impact` page + `GET /payments/impact-summary`.
5. DONE (not live-tested): sponsored cleanups: migrations 115 and 116, funding flow with payout-rule picker, site claim flow, allocations, admin review queue, group area picker in event creation (`SponsoredAreaPicker`, shared by `CreateCleanupEventForm` and the `ContributionPanel` modal). Group allocations are queued only when an organizer logs a team total; individual-logging events do not create them.
6. DONE (code, not committed, mostly not browser-verified): per-bag payout rules and dollar-based limits (120), Plus earning-cap multiplier and funding perks (118, 119), boundary-based areas (117), event page Sponsored card. Open checks: `payments-v2-verification-checklist-2026-10-16.md`.
7. Deploy: see "Deploy runbook" at the bottom of this doc. Migrations live in `supabase/migrations/109-120`.
8. Docs: `campaign-app-scope.md` and `master-backlog.md` updated 2026-10-20; `branch-tracker.md` and `app-capability-doc.md` still owed (not on disk locally, arrive with the master merge).

## Remaining open questions

- Team-up mechanic details (deferred).
- Exact default cap values (starting suggestion above).
- Stripe setup info needed at step 3: test secret key, webhook secret (via Stripe CLI), and the $5/month Price ID.

## Open decision: app store billing rules for Plus (noted 2026-10-20)

Not built or handled yet. Plus checkout is plain Stripe Checkout, and the Capacitor builds (iOS and Android) behave the same as the web. Policy details below are from memory and change often, so **verify against current Apple and Google policy before relying on them**.

**The problem:** Plus unlocks digital features inside the app. Apple (guideline 3.1.1) and Google Play billing policy generally require their own in-app purchase for that, at 15-30% commission. Sending native users to Stripe for Plus could get the app rejected or pulled. Must be decided before `payments_enabled` is turned on for app users. Not a blocker for the admin-only demo.

**Not affected:** sponsorships (fund real-world cleanups) and payouts to earners (real-world rewards) are normal Stripe flows, not IAP.

**Options for Plus:**
1. **Hide purchase in native builds.** Users subscribe on the web, the app only shows status and perks. Least work. Apple can still object to apps that reference outside purchase, so keep the native wording neutral.
2. **US-only external link** to web checkout from native builds, relying on the 2025 Epic rulings (Apple external links without commission in the US, Google alternative billing relief in the US). Not valid outside the US, and appeals may change it.
3. **Full IAP** with StoreKit and Play Billing via RevenueCat or `cordova-plugin-purchase`. Needs a webhook mapping store receipts into the `subscriptions` table, product setup in both consoles, and a 15-30% fee. Works worldwide. Capacitor can do this.
4. **Hybrid:** IAP for non-US users, external link for US users.

**What users would see (Stripe flows):**
- Paying: Stripe Checkout with card, Apple Pay or Google Pay, optionally ACH. Cash App Pay is available for US payers.
- Receiving: Stripe Connect Express with hosted onboarding (identity check, bank account or debit card). Users never enter bank details in our app. We still owe tax forms.
- Venmo: Stripe does not pay out to Venmo. The PayPal Payouts API can pay Venmo accounts in the US, but it is a second provider with its own compliance and reconciliation. Treat as a later add-on after Connect.

## Stripe setup and cutover (2026-10-22)

Sandbox products, prices, portal and local webhook forwarding are set up. Full steps for local testing, prod with sandbox keys, and cutting over to live Stripe are in `stripe-setup-and-cutover-2026-10-22.md`.

## Status summary (2026-10-20)

- **Built:** Frontline Plus subscriptions (checkout, billing portal, webhook), sponsorships (general fund, sponsored sites and areas), sponsored cleanup payout tracking, the Impact page, admin tools and the sponsored map layer. Everything is hidden from regular users behind `payments_admin_preview` and `payments_enabled`.
- **Deployed:** migrations 109-120 and the frontend are live in prod. The backend deploy is waiting on the Railway build outage, so admin payments pages stay empty until it ships.
- **Not built:** real payouts (Stripe Connect; "Mark paid out" and "Mark released" are bookkeeping only), sponsor reward fulfillment (manual), and the legal and tax review needed before money moves in either direction.
- **Not done yet:** Stripe prices, webhook and prod env vars (not needed for a demo without real checkout), real checkout and webhook testing, browser verification of the checklist, running the demo sponsorship SQL (`YOUR_USERNAME` placeholder), committing the master merge, and opening the PR.

## Work left: payments and money flow (2026-10-20)

- **Stripe Connect payouts:** not built. Earner onboarding and KYC, transfers, failure and reversal handling, tax forms. "Mark paid out" and "Mark released" only record state.
- **Legal and tax review** before money moves in either direction.
- **Stripe setup and real tests:** $5 Plus price, price IDs, webhook secret, env vars, live checkout and webhook (including group Support gifts).
- **Reward fulfillment** for sponsor rewards is manual.
- **Allocations:** store reported bag count (needs migration), cap-reason reporting, small vs large bag handling, minimum-payout warning, review queue paging.
- **Gaps:** sites list capped at 200; events cannot change sponsorship after create; `/api/sponsored` proxy turns non-JSON errors into `{}`; Impact page counts differ from `campaign_dashboard.py`; boroughs not in boundary list; solo hosts cannot earn from areas.
- **Later ideas:** optional per-group cap across pools, CSV export and per-event impact reports for group Plus, persisted sponsored-areas map toggle, grouping stacked site pins.
- **Cleanup:** delete unused `PersonalInsightsCard.tsx`, `SupporterBadge.tsx`, `groups/[slug]/stats/PremiumInsightsCard.tsx`, `app/sponsorships/SponsorExplainer.tsx`, and the unused `canSeePayments` prop in `GroupStatsView`.

## Deploy status (2026-10-20)

- Migrations 109-120 applied to prod. Frontend deployed.
- Backend NOT deployed yet: Railway paused new builds (outage). Until it ships, admin payments pages are empty or 404; regular users are unaffected. Re-trigger the deploy when builds resume, then run the admin and non-admin smoke tests (Deploy runbook, step 4 and 5).
- Master merged into the branch, conflicts resolved, merge not yet committed. PR not yet opened. Version bumped to 5.0.1.
- Optional demo data: `POST /admin/seed/payments-mock` with the admin secret (mock Plus subscriptions and funded mock sponsorships). Do not seed prod without a clear decision.
- Developer-facing error text (env var names, "check the API") removed from the UI; admin routes now return a generic message.


## Deploy runbook (carried over from the deleted deployment plan, 2026-10-20)

Goal: payments live in prod for demo use but invisible to regular users: `payments_enabled` = 0, and only site admins see anything while `payments_admin_preview` = 1.

**Merge rules**
- Before merging, recheck migration numbering: `git ls-tree --name-only origin/master supabase/migrations/ | sort | tail`. If master gained a 109+, renumber ours (done once before, commit `3132e34`) and update references.
- After resolving the master merge: `npx tsc --noEmit -p .`, backend `py_compile`, re-verify payments flows, then open the PR. Do not merge the PR without explicit go-ahead.
- Migrations are append-only. Never edit an applied migration; add 121+ for fixes.

**Migrations 109-120** (applied by the user, never from Claude; prod already has them)

| # | What it does |
|---|---|
| 109 | `subscriptions` table; `stripe_customer_id` on profiles and groups |
| 110 | `set_updated_at` trigger function; `stripe_webhook_events` (webhook dedupe) |
| 111-112 | `sponsorships` table; general-fund target |
| 113-114 | game settings `payments_enabled` (default 0) and `payments_admin_preview` (default 1) |
| 115 | sponsored cleanups: site claims, allocations, payout rule columns |
| 116 | `cleanups.sponsorship_id` plus one-allocation-per-cleanup index |
| 117 | area geometry on sponsorships |
| 118-119 | Plus earning-cap multiplier; funding perks (`groups.open_to_sponsors`, direct group support, `funded_at`) |
| 120 | payout limit settings converted to dollars (`_usd` keys) |

Checks after applying: `select key, value from game_settings where key in ('payments_enabled','payments_admin_preview');` returns 0 and 1; `subscriptions` and `sponsorships` tables exist; `cleanups.sponsorship_id` exists. Existing pages read `subscriptions` and `cleanups.sponsorship_id` for every user, so migrations must be in before the code.

**Environment variables**
- Backend (Railway): `ADMIN_API_SECRET` (must match the frontend value exactly; the sponsored and payments proxy routes send it) and `FRONTEND_URL` (used for Stripe success and cancel URLs; confirm it is the prod URL) are already set. New: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_INDIVIDUAL`, `STRIPE_PRICE_ID_GROUP`. For a demo without real checkout these can stay unset (checkout errors, nothing else breaks). Never put a `sk_test_` key in prod; use Stripe test mode keys only on staging.
- Frontend (Vercel): no new variables. Needs existing `ADMIN_API_SECRET` and `NEXT_PUBLIC_FASTAPI_URL`.

**Stripe dashboard (only when turning real checkout on)**
- Create the Frontline Plus individual and group prices and copy the price IDs.
- Add a webhook endpoint at `https://<backend>/api/payments/webhooks/stripe` with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, then copy the signing secret.
- Enable the billing portal.

**Deploy order**
1. Apply migrations 109-120 to prod.
2. Deploy the backend (new routes, services, `/api/payments`, `/api/sponsorships`).
3. Deploy the frontend.
4. Smoke test as an admin: Partners page shows the Sponsored cleanups and Impact cards; `/sponsorships` loads; the map's Sponsored areas toggle works.
5. Smoke test as a non-admin: no payment UI anywhere; leaderboards, group pages and event pages load normally.
6. Optional demo data: `POST /admin/seed/payments-mock` (see Deploy status).

**Visibility and rollback**
- Everything is hidden from non-admins by `paymentsVisible`. To hide from admins too, set `payments_admin_preview` to 0.
- To open it to everyone, set `payments_enabled` to 1. Do not do this before the "Work left" items above are done (Connect payouts, legal and tax review, Stripe setup and real tests, reward fulfillment, browser verification).
- Rollback: the code is safe to redeploy to the previous version at any time because the migrations are additive. Do not drop the tables.
