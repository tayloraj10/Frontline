# Payment Platform Integration — Scoping — 2026-08-20

**Status: scoping only, not started.** No payment provider exists anywhere in the codebase today (confirmed via grep — zero Stripe references outside the backlog note itself). This doc exists to turn the three-use-case backlog item (`master-backlog.md`, "Payment platform integration") into something buildable, and to surface the decision the backlog item itself flags as still open: **which use case ships first.**

## The three use cases, and why they're not one project

| | Subscriptions | Challenge payouts | Sponsorships |
|---|---|---|---|
| Money flows | User → Frontline | Frontline → User | Sponsor → escrow → User |
| Stripe product | Billing/Checkout | Connect (payouts) | Connect (payouts) + escrow logic |
| KYC needed | No (Stripe hosts card entry, we never touch PII) | Yes (payout recipients) | Yes (payout recipients) |
| New domain concept needed | Entitlements | **Challenge/prize entity (doesn't exist)** | Sponsorship entity + escrow state machine |
| Regulatory weight | Lightest | Heavier (tax/1099, sweepstakes law) | Heaviest (escrow, sponsor refund terms) |

These aren't three configurations of the same feature — they're two different Stripe product families (Billing vs. Connect) and three different domain models. Treat them as separate integrations that may end up sharing one Stripe account and one `stripe_customer_id`-style column, not as phases of a single build.

## What already exists that this should reuse, not duplicate

- **No entitlement/plan concept anywhere** — confirmed via grep across `backend/app` and `frontend/src`. The only "tier" hit is `radius_tier` in `partners.py`, an unrelated spatial concept (block/neighborhood/wide geofence radius). Subscriptions need this built from scratch.
- **No challenge/prize entity** — the app has "boss events" and "community challenges" as *narrative* concepts (`campaign-app-scope.md` lines ~126, 230, 524) but nothing that models "this specific challenge has a winner and a payout." Challenge payouts can't be scoped as "add Stripe to an existing challenge system" — the challenge system itself needs designing first, or this use case needs to be re-scoped as "one-off admin-triggered payout to a specific user," which is a much smaller lift than a generalized challenge/leaderboard-driven payout trigger.
- **`group_members.role IN ('admin','member')`** (`supabase/migrations/017_dev_schema.sql`) — the closest existing thing to "who can manage a group's money." No `groups.stripe_customer_id` or billing-contact field exists. If group-level subscriptions (e.g. "premium group analytics") ship, this role is the natural gate for who can start/cancel a subscription — reuse it rather than inventing a separate billing-admin concept, unless the multi-tier admin roles work (below) changes what "group admin" means first.
- **No role/permission table at all** — confirmed: platform admin auth today is a shared-secret header (`admin_prod.py`'s `_check_secret()`), not a user-role table. This matters directly for challenge payouts and sponsorships: "who can approve a payout" or "who can mark a sponsorship complete" needs *some* real permission model, which the backlog's separate **Multi-tier admin roles** item (`master-backlog.md`, Admin section) is supposed to provide. Payout-adjacent use cases are blocked on that item landing first, or need their own narrow bolt-on permission check as a stopgap.
- **Cleanup contribution anti-fraud gap is client-trusted today** (`campaign-app-scope.md`, noted repeatedly across the backlog) — directly relevant to challenge payouts and sponsorships, both of which pay real money based on "who completed the most/who completed a cleanup." Paying real money on top of a client-trusted signal is a materially bigger problem than the existing points-inflation risk. This is not a nice-to-have fix, it's a precondition for either of these two use cases going live with real money.
- **Router/data-access pattern** (`backend/app/api/routes/*.py`, FastAPI `APIRouter` per file, async SQLAlchemy `text()` queries, no ORM models) — a `payments.py` router follows this same convention; no new architectural pattern needed for the code layer itself.

## Use case 1: Subscriptions (premium tier)

**Stripe product:** Billing/Checkout. No KYC, no payout rails — Stripe hosts the card entry (SAQ-A scope, we never touch card data), we just react to webhooks.

**What's new:**
- `profiles.stripe_customer_id` (or a separate `subscriptions` table if group-level plans are also in scope — see below).
- An entitlements check — some `has_premium(user_id)` / `has_premium(group_id)` helper gating whatever premium features ship (backlog only names "advanced group analytics" as an example; nothing concrete decided).
- Checkout session creation endpoint + a webhook endpoint (`payments.py`: `POST /checkout/session`, `POST /webhooks/stripe`) handling `checkout.session.completed`, `customer.subscription.updated/deleted` at minimum.
- Decide: **individual subscription, group subscription, or both?** A group subscription needs a payer-of-record (see `group_members.role='admin'` above) and raises "what happens to entitlement if the paying admin leaves the group" as an open question.

**Rough size:** smallest of the three. No new domain entity, no payout complexity, no escrow. Mostly Stripe Checkout + webhook plumbing + whatever the entitlement actually gates (which isn't designed yet).

## Use case 2: Challenge payouts

**Stripe product:** Connect (Express or Custom accounts for payout recipients) + Identity/KYC via Connect onboarding.

**What's new and not yet designed:**
- **The challenge entity itself.** Nothing today models "a challenge with a start/end, a winning condition, and a declared winner." This needs to be scoped as its own piece before payment rails matter — options range from a full generalized challenge system (big) to an admin manually creating a one-off "pay user X $Y for winning campaign event Z" record (small, punts the challenge-detection logic to a human).
- `stripe_connect_account_id` on `profiles` for payout recipients, plus Connect onboarding flow (redirect to Stripe-hosted KYC).
- A payout trigger — likely admin-confirmed rather than automatic at first, given the anti-fraud gap above means leaderboard/challenge results aren't currently trustworthy enough to auto-trigger real money.
- Tax reporting (1099-NEC/1099-K obligations once a recipient crosses IRS thresholds) — a Stripe Connect feature, but needs a decision on who's the "platform" of record for tax purposes.

**Rough size:** largest ambiguity of the three, because the prerequisite domain model (challenges) doesn't exist. Recommend scoping the challenge entity separately, sized independently, before sizing the payment layer on top of it.

## Use case 3: Sponsorships

**Stripe product:** Connect (same payout rails as challenge payouts, likely shared plumbing) + an escrow-like holding pattern (Stripe doesn't have true escrow — this means holding sponsor funds as a Payment Intent that's captured/released only on cleanup verification, not an off-the-shelf Stripe feature).

**What's new:**
- A `sponsorships` table: sponsor (user or business — ties into the existing `partner businesses`/`partners.py` concept if a business sponsors), target (a specific cleanup event or geo area), amount, status (`pending_funding` → `funded` → `released` → `refunded`), and a link to whatever "verified complete" means for the target cleanup.
- Sponsor-facing funding flow — a new UI surface, likely reusing Partner Dashboard patterns (`PartnerDashboardClient.tsx`) if business sponsorship is the primary case, or a new individual-sponsor flow if not.
- Release trigger tied to cleanup verification — same anti-fraud dependency as challenge payouts: releasing real money on "cleanup marked complete" needs that completion to be trustworthy, which today it isn't (client-side only, no server proximity check, per the standing anti-fraud backlog item).
- Refund/cancellation path if a sponsored cleanup never happens (deadline passes, organizer cancels, etc.) — not just a payout state machine, a full escrow lifecycle.

**Rough size:** most moving pieces of the three (new entity, new sponsor-facing flow, escrow state machine, refund path), but shares Connect payout plumbing with use case 2 if that's built first.

## Cross-cutting blockers (apply regardless of which use case ships first)

1. **Legal/tax review** — flagged in the backlog as likely the bigger blocker than code. Money changing hands for challenge wins and sponsorships raises different regulatory questions (sweepstakes/contest law, 1099 reporting, possibly money-transmitter exposure for the escrow pattern) than a subscription does. This should happen *before* detailed design work on use cases 2 and 3, not in parallel with it — a legal constraint could reshape the payout trigger design entirely (e.g. "no automatic payouts, admin must manually release every payment" as a compliance requirement, not just a fraud-mitigation choice).
2. **Fraud/anti-gaming review** — the standing cleanup-contribution anti-fraud gap (client-side only, no server proximity check) becomes a real-money problem the moment use case 2 or 3 ships. Recommend treating "harden the anti-fraud gap" as a hard precondition for those two, not a parallel nice-to-have.
3. **No permission/role table** — challenge-payout approval and sponsorship-release actions need real access control beyond the current shared-secret admin pattern. Either the Multi-tier admin roles backlog item lands first, or these two use cases need a narrow standalone permission check as a stopgap (not recommended — duplicated effort once the real role system lands).
4. **One Stripe account or several?** — recommend one Stripe account, since Connect (payouts) and Billing (subscriptions) can coexist on a single account; the "may end up as separate integrations" framing in the backlog is about code/product separation, not necessarily separate Stripe accounts.

## Suggested build order

Given the size/risk table above:

1. **Subscriptions first**, if a premium feature is worth gating (still undecided — "advanced group analytics" is the only example named, not committed). Smallest lift, no legal complexity beyond standard SaaS billing terms, no dependency on the anti-fraud fix or the admin-roles work.
2. **Everything else is blocked** on (a) legal/tax review, (b) the anti-fraud hardening, and (c) the challenge entity design (for use case 2) — these should be scoped and resourced before either payout use case gets a detailed technical plan. Recommend not starting use case 2 or 3's implementation design until at least the legal review is underway.
3. Between challenge payouts and sponsorships, sponsorships has a clearer trigger (a specific event/area, business-sponsor relationship already has a home in the Partner system) even though it has more total pieces — challenge payouts is blocked on a domain concept (challenges) that doesn't exist at all yet, which is likely the longer pole.

## Open questions (need a decision before building, not before scoping)

1. Is a premium tier actually worth building — what's the premium feature, concretely? Nothing beyond "advanced group analytics" is named.
2. Individual subscriptions, group subscriptions, or both?
3. Should "challenges" be built as a generalized system, or should challenge payouts start as an admin-manual one-off payout tool that sidesteps needing a generalized challenge entity?
4. Who is the legal/compliance owner for the tax and money-transmitter questions — is this something the user handles directly, or does it need outside counsel before any Connect work starts?
5. For sponsorships: individual sponsors, business sponsors only, or both? Affects whether this reuses the existing Partner business flow or needs new individual-sponsor onboarding.

## Addendum 2026-08-30 — Subscriptions build plan (paused, not started)

Decisions made, not yet implemented. Use cases 2 and 3 (challenge payouts, sponsorships) remain fully blocked as scoped above — this addendum only concerns use case 1.

**Locked-in decisions:**
- Build in Stripe **test mode** — no legal entity or bank account needed for test mode; that's only required to go live with real cards later.
- Build the Checkout/webhook/entitlement plumbing now, without deciding what premium actually gates yet.
- Support **both individual and group** subscriptions from the start (not individual-only).
- Ship real frontend UI now, but keep it invisible to users behind a master toggle rather than leaving it on an unmerged branch — reuse the existing admin-editable `game_settings` table/panel (`supabase/migrations/055_game_settings.sql`, `backend/app/services/game_settings.py`, `frontend/src/lib/gameSettings.tsx`, `frontend/src/app/admin/AdminPanel.tsx`) with a new `payments_enabled` (0/1) row in a new `features` category. The admin panel already renders settings by category generically, so no admin UI code changes needed. "Launching" later is flipping this one flag live, not a deploy or a branch merge.

**Planned data model** (new migration, not yet written):
- `profiles.stripe_customer_id`, `groups.stripe_customer_id`.
- `subscriptions` table: `owner_type ('user'|'group')`, `owner_id`, `stripe_customer_id`, `stripe_subscription_id` (unique), `stripe_price_id`, `status` (mirrors Stripe's status strings), `current_period_end`, `cancel_at_period_end`, timestamps. RLS enabled, no public policies — backend-only access via service role, same as the rest of the app's DB access pattern.

**Planned backend** (`backend/app/api/routes/payments.py`, not yet written):
- `POST /checkout-session` — creates/reuses a Stripe Customer, starts a Checkout Session in subscription mode. For group subscriptions, requires the requesting user to be a `group_members.role = 'admin'` for that group (reuses the existing check pattern in `groups.py`).
- `POST /webhooks/stripe` — verifies Stripe's signature, upserts `subscriptions` on `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted`.
- `GET /entitlement` — `has_premium` check for a given owner; the one endpoint other features will call later once something is actually gated.
- `POST /portal-session` — opens Stripe's hosted billing portal so a subscriber can manage/cancel without custom UI.

**Planned frontend** (not yet written): an "Upgrade" trigger in account settings (individual) and group admin settings (group), each redirecting to Stripe Checkout; two bare `/billing/success` and `/billing/cancel` pages. No plan-picker UI yet since there's nothing concrete to sell. All of it gated behind `payments_enabled` via `useGameSettings`.

**What's needed from the user before/while building:** a Stripe account (test mode needs no business/bank info), a test secret key, two test Products/Prices (individual + group, placeholder pricing), and the Stripe CLI installed locally for webhook forwarding during dev. Deciding what premium actually unlocks is *not* a blocker for this build.

**Status: paused here, not started.** Resume by picking this addendum back up.

## Addendum 2026-09-12 — Premium & donation features shortlist

Full list of candidate features surfaced for the subscription/donation pathways, so the ones not being built now aren't lost. User picked #1, #2, and #8 to build this session; everything else stays a backlog candidate.

**Premium subscription (individual)**
1. **Personal impact analytics** — streaks, lifetime stats, trend charts (mirrors the group version already built for `PremiumInsightsCard`). **BUILT** — `GET /users/{user_id}/premium-insights`, `PersonalInsightsCard.tsx` on the profile page, gated by `has_premium()`.
2. **Custom profile badge/flair** — a visible "Supporter" mark on your profile/leaderboard entry. **BUILT** — `SupporterBadge.tsx`, shown next to the username on the profile page (admin-viewer-only for now).
3. **Early access to new cleanup events** — see/RSVP to newly posted events before the general public (useful if events fill up). Deferred.
4. **Ad-free / priority support** — only relevant if ads or a support queue exist; skip if they don't. Deferred, and possibly not applicable at all.

**Premium subscription (group)**
5. **Group analytics** — already built before this addendum (`PremiumInsightsCard` on group stats).
6. **Custom group branding** — logo/banner on the group's public page. Deferred.
7. **Bulk member tools** — CSV export of member activity, scheduled recurring events. Deferred.

**One-off "GoFundMe" donation (no feature unlock)**
8. **Pure mission-support checkout** — one-time amount, optional public/anonymous "supporter wall" of names, no gating logic needed at all. **BUILT** — extended `sponsorships` with a `general` target type (migration 103), so it reuses the existing `SponsorshipsHub` checkout flow with a "Frontline's general fund" target instead of a specific cleanup/area. The public "supporter wall" display was not built — only the admin-facing sponsorship list shows it today.

Deferred items (#3, #4, #6, #7) are legitimate backlog candidates, not rejected ideas — revisit when there's appetite for a bigger scope than a single build session.

## Addendum 2026-09-12 — `payments_enabled` global toggle, implemented

User asked for a single game-settings switch to turn all money-related surfaces on/off at once, so launch is "flip one flag" rather than a deploy. Decision on scope: **"Full open"** — the toggle controls both UI visibility and backend authorization. Site admins always see/use every payment surface regardless of the toggle's state (for testing); everyone else is gated on the toggle.

**Data model:** `game_settings` row `payments_enabled` (0/1, `payments` category), added via `supabase/migrations/109_payments_enabled_toggle.sql`. Starts off (`0`).

Note: this branch and `master`/`group-and-admin-pulse-checks` independently used migration version numbers 103-108 for unrelated features after diverging from a shared ancestor at 102, so the local dev Postgres instance already had those version numbers recorded under master's content. This migration was numbered 109 to avoid the collision and applied directly rather than via `supabase migration up --local`. Reconciling the migration-history mismatch (e.g. via `supabase migration repair --local`) is a separate decision, not made here since it touches unrelated migration history.

**Admin UI:** No new admin UI needed — `AdminPanel.tsx`'s existing generic settings-by-category renderer now includes a "Payments" category and treats `payments_enabled` as a boolean toggle, same pattern as the original plan's `features` category.

**Backend/frontend gating**, `isSiteAdmin || paymentsEnabled` (or an authenticated user, for proxy routes where "everyone" needs a session anyway):
- New `frontend/src/lib/gameSettings.server.ts` — server-component read of `payments_enabled` (the existing `useGameSettings` hook is client-only).
- New `frontend/src/lib/paymentsAuth.ts` — shared `requireAdminOrPaymentsEnabled()` helper for Next.js API routes: requires an authenticated user, then passes if they're a site admin OR the toggle is on.
- Server components gated: `sponsorships/page.tsx`, `cleanup-events/[id]/page.tsx` (SponsorshipWidget), `users/[username]/page.tsx` (SupporterBadge, SubscriptionWidget, PersonalInsightsCard), `groups/[slug]/page.tsx` (SubscriptionWidget), `groups/[slug]/stats/page.tsx` + `GroupStatsView.tsx` (PremiumInsightsCard — this page had no site-admin check at all before, only group-role admin, so one was added).
- Proxy routes gated via `requireAdminOrPaymentsEnabled()`: `POST /api/admin/payments/checkout-session`, `GET /api/admin/payments/entitlement`, `POST /api/admin/payments/portal-session`, `POST /api/admin/sponsorships` (create checkout session).
- Proxy routes left admin-only (internal management actions, not user-facing payment flows): `GET /api/admin/sponsorships` (list all sponsorships), `POST /api/admin/sponsorships/[id]/release`.

**Not done as part of this addendum:** the stale "Admin-only, funding-only harness" copy on `sponsorships/page.tsx` (tracked with the other mission-copy updates); a dedicated payments entry point inside `/admin` beyond the existing Settings-tab toggle; the `GET /users/{user_id}/premium-insights` unverified `viewer_user_id` gap (separate, pre-existing security issue, not related to this toggle).
