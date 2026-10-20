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
7. Deploy: `payments-v2-deployment-plan-2026-10-20.md`; all prod migrations in `payments-v2-prod-migrations-109-120.sql`.
8. Docs: `campaign-app-scope.md` and `master-backlog.md` updated 2026-10-20; `branch-tracker.md` and `app-capability-doc.md` still owed (not on disk locally, arrive with the master merge).

## Remaining open questions

- Team-up mechanic details (deferred).
- Exact default cap values (starting suggestion above).
- Stripe setup info needed at step 3: test secret key, webhook secret (via Stripe CLI), and the $5/month Price ID.

## Work left: payments and money flow (2026-10-20)

- **Stripe Connect payouts:** not built. Earner onboarding and KYC, transfers, failure and reversal handling, tax forms. "Mark paid out" and "Mark released" only record state.
- **Legal and tax review** before money moves in either direction.
- **Stripe setup and real tests:** $5 Plus price, price IDs, webhook secret, env vars, live checkout and webhook (including group Support gifts).
- **Reward fulfillment** for sponsor rewards is manual.
- **Allocations:** store reported bag count (needs migration), cap-reason reporting, small vs large bag handling, minimum-payout warning, review queue paging.
- **Gaps:** sites list capped at 200; events cannot change sponsorship after create; `/api/sponsored` proxy turns non-JSON errors into `{}`; Impact page counts differ from `campaign_dashboard.py`; boroughs not in boundary list; solo hosts cannot earn from areas.
- **Later ideas:** optional per-group cap across pools, CSV export and per-event impact reports for group Plus, persisted sponsored-areas map toggle, grouping stacked site pins.
- **Cleanup:** delete unused `PersonalInsightsCard.tsx`, `SupporterBadge.tsx`, `groups/[slug]/stats/PremiumInsightsCard.tsx`, `app/sponsorships/SponsorExplainer.tsx`, and the unused `canSeePayments` prop in `GroupStatsView`.
