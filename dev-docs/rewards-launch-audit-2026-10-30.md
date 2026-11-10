# Rewards Launch Audit (2026-10-30)

Visual version (private artifact, same content): https://claude.ai/artifact/G8JAgq2giEFwnocnhLumyA
This markdown file is the source of truth. Update it first; the artifact is a snapshot.

Code-level review of the four Rewards tabs (Perks, Earn, Hire, Impact) against one goal: paying real people real money for cleanup work, safely, with flows that work on a phone. Audit only. No code, DB or Stripe changes were made.

Items marked "not read" are where confidence is lowest.

## Status at a glance

| Tab | Route | State | Headline |
|---|---|---|---|
| Perks | `/partners` | Security fix needed | Works end to end, but the API trusts any caller |
| Earn | `/sponsorships` | No payout rail | Best-secured API, but money out is an admin flagging "paid" after paying by hand |
| Hire | `/marketplace` | Closest to live | Full hold, release and payout flow, gaps in pricing, alerts, privacy |
| Impact | `/impact` | Light, one big question | Stats and Plus; needs an iOS billing decision and a personal earnings view |

## Launch blockers

| ID | Blocker | Tab |
|---|---|---|
| PK-1 | Redeem, redemption lookup and mark-used take a client-supplied `user_id` with no auth | Perks |
| EN-1 | Sponsored payouts are manual; no payout method collected; earner never notified of approve, reject or paid | Earn |
| EN-2 | No agreement, 18+ check or tax step before earning real money | Earn |
| EN-6 | Copy still says test mode | Earn |
| HR-1 | "Hourly" jobs charge one flat amount, no hours tracking | Hire |
| HR-2 | Direct requests, accepts, declines, cancels, disputes send no notification | Hire |
| HR-3 | 10% fee is a placeholder, hidden from customers, no minimum price | Hire |
| HR-4 | `POST /sweep` unauthenticated, and no proven scheduler | Hire |
| HR-5 | Exact coordinates, site polygon and address go to every signed-in user | Hire |
| IM-1 | Plus is a digital subscription; iOS needs Apple IAP or must be hidden | Impact |
| X-1 | Test-mode copy in four places | All |
| X-2 | Confirm migrations 121 to 125 are applied in prod (123 was local only per scope doc). User runs this, never Claude | Hire |

## Perks (`/partners`)

**Exists:** browse page with offer cards; atomic redeem (row locks, point balance, caps, event check-in rule); ticket-style confirmation modal with shared code and "Already used" state; business apply flow, dashboard, radius stats, tier activity, co-admins; offer attachment to events with organizer notify email.

**Missing:** identity check on redeem and lookup; a code the business can trust; staff-side confirmation; a single "my redemptions" list.

- **PK-1 (P0)** Partners endpoints trust a browser-sent `user_id`. The browser calls FastAPI directly. `POST /offers/{id}/redeem` takes `{user_id, location_id}`, `GET /offers/{id}/redemptions/me?user_id=` returns codes, `POST /redemptions/{id}/mark-used` takes no identity. `main.py` has no auth middleware. Anyone with a user id can spend that person's points or burn their redemption. Fix: route through the Next proxy pattern Earn and Hire use (session identity, shared secret, allowlisted paths) or verify the Supabase JWT in FastAPI; drop `user_id` from bodies and queries. Where: `backend/app/api/routes/partners.py` (redeem ~61, my-redemptions ~251, mark-used ~284).
- **PK-2 (P1)** One shared code per offer can be screenshotted and passed around; "Mark as used" is pressed by the user, not the business. Fix: per-redemption single-use code plus business confirmation on their dashboard.
- **PK-3 (P1)** N+1: every `OfferCard` fetches its own `redemptions/me`. Fix: one `GET /redemptions/me`, match by offer id client side. Where: `PartnersBrowseClient.tsx`.
- **PK-4 (P2)** Businesses with no offer or no active campaign are hidden, so a new city can show an empty tab. Add "nominate a business", sort by distance and points cost.
- **PK-5 (P2)** Not read: `[slug]` detail page, apply page, business dashboard, `partners.py` lines 330 to 966. Check business-admin routes for the same missing-identity problem.

## Earn (`/sponsorships`)

Flow: sponsor pays (Checkout) -> pool funded -> cleaner claims in range -> before and after photos -> admin approves -> admin pays by hand and marks "paid".

**Exists:** site pools and group-area pools (map + list); four payout rules (single, flat per cleanup, per bag, equal split per attendee); caps per person/group/day with 2x Plus multiplier and 48h Plus head start; locked-row approval so a pool never goes negative; claim expiry that reopens the site and notifies; plain-language summary on the sponsor form; admin review queue; proxy with allowlist, session identity, admin-only review routes.

**Missing:** any in-app way to pay the cleaner; payout method for earners; notifications for approved, rejected, paid; earnings history; terms, age, tax steps; refund path for unspent sponsor money; review that scales past one admin.

- **EN-1 (P0)** "Paid out" is a flag and the earner hears nothing. `mark_paid_out` records an out-of-band payment; no payout destination is collected; only claim-expiry notifies. Fix: reuse Hire's Connect Express onboarding (`connect.py`) for earners, create a Connect transfer on approval, set `paid_out` from the transfer webhook not a button, notify on approved/rejected/paid with amount. Where: `backend/app/services/sponsored_cleanups.py` (~916, ~979).
- **EN-2 (P0)** No agreement, 18+ or tax step before payouts. Hire has them, Earn does not. Connect Express collects identity and tax info. Have an accountant confirm reporting duties for Earn and Hire.
- **EN-6 (P0)** Test-mode copy: page subtitle "Test mode only, no payouts yet.", button "Start test checkout", success banner relies on webhook with no polling.
- **EN-3 (P1)** Every payout waits on one human. Add claimant status text, admin alerts, low-amount auto-approval when GPS and photos pass with random audits, optional sponsor self-approval.
- **EN-4 (P1)** Fraud surface: client-reported GPS, no photo reuse check, per-account caps (many accounts can drain a pool), review card lacks distance, photo timestamps, claimant history. Fix: show those, hash photos, hold first payouts for new accounts.
- **EN-5 (P1)** Unspent sponsor money has no defined outcome ("Mark released" only records a decision). Decide: expire after N days and refund remainder, or convert to donation; show on form and receipt; decide on a pool fee.
- **EN-7 (P1)** Sponsor form is heavy for a first-time donor. Lead with presets, put rules and caps under Advanced, keep the summary.
- **EN-8 (P2)** No "my earnings" view on Claim; hidden panels still mount; admins fetch the full list on load; no sponsor receipt page.
- **EN-9 (P2)** Not read: `SponsoredSites`, `SponsoredMap`, `AreaBuilder`, `SitePlacePicker`, most of `sponsored_cleanups.py` (claim and photo submission). Claim screen on a phone needs a hands-on pass.

## Hire (`/marketplace`)

Flow: posted/requested -> cleaner accepts, card charged and held -> before photo + GPS, start -> after photo + GPS, complete -> customer confirms or auto-release in 3 days -> Connect transfer of price minus 10% -> reviews.

**Exists:** board with map, list, category tiles, closest-to-me sort; cleaner directory, profiles, ratings; post form with three time modes and saved-card gate; Stripe hold on accept, GPS-checked start/finish, auto-release, refund, dispute; Connect Express onboarding with payout gating; agreements with version and typed-name signature; report, block, admin moderation; price flags; location override that flags the job; idempotency keys on charge, transfer, refund.

**Missing:** hours tracking, tips, extra-work approval; most lifecycle notifications; customer-visible fee breakdown; cleaner earnings page and Stripe dashboard link; seeded supply; cancellation/no-show/dispute policy in the UI; chargeback and transfer-failure runbook.

Money and logic:
- **HR-1 (P0)** Hourly price type charges one flat `price_cents`. Fast fix: fixed-price only at launch, hourly rate stays a profile hint. Later: max-hours hold, hours at completion, customer confirmation. Where: `marketplace_payments.py charge_job`; `JobForm.tsx`.
- **HR-3 (P0)** Fee placeholder (`marketplace_platform_fee_percent` default 10), hidden from customers, `JobIn.price_cents` only gt 0 (le 1,000,000). Stripe ~2.9% + $0.30: a $10 job nets about $0.41, a $20 job about $1.12. Fix: choose fee, server and form minimum, show "Cleaner receives $X, service fee $Y" before posting and before accepting, state it in both agreements, check who bears Connect account/payout fees.
- **HR-4 (P0)** `POST /sweep` is the only marketplace route without the shared secret. Idempotent, so low risk, but anyone can trigger writes. Bigger risk: if no cron calls it, auto-release never fires. Fix: require secret, schedule every few minutes, alert if it has not run in 30 minutes.
- **HR-6 (P1)** Failure paths need written answers: card declines at accept time, transfer fails because the Connect account got restricted, chargeback after transfer, refund request after release. Add `charge.dispute.*` and `transfer.failed` webhooks and an admin runbook.
- **HR-7 (P1)** Cancellation, no-show, dispute rules not on screen. Add policy block, cleaner reliability count, dispute form with statements from each side.

Flows and notifications:
- **HR-2 (P0)** Only `_notify_nearby_cleaners` (new board jobs) fires. Missing: direct request to cleaner, accepted/declined to customer, cancels, dispute opened/resolved. Direct requests expire unseen. Fix: `_notify` on every transition plus admin alerts; day-of reminder is the best no-show reducer. Where: `backend/app/services/marketplace.py`.
- **HR-8 (P1)** No earnings total, pending vs released split, or Stripe Express dashboard link. `CleanerFlow` still says "Bank payouts turn on once Stripe Connect is live."
- **HR-9 (P1)** Cold start: profiles are `active` on insert with no review; notifications only reach cleaners in radius; "no cleaners in your area" is the likely first screen. Pilot one area, invite top contributors as cleaners, post 5 to 10 real jobs, waitlist outside.
- **HR-10 (P1)** Safety on private property: no background check; the pending-review copy says profile is being set up while code sets `active`. For pilot, allow only public-space job types or manually approve private-property work; make status copy match behavior.

Privacy and security:
- **HR-5 (P0)** `_JOB_COLS` includes `area` GeoJSON; board returns lat/lng and `address_label` to any signed-in user. Fix: round to ~300 m and drop address and area for non-participants; reveal exact location only to accepted cleaner and customer. Where: `marketplace.py _JOB_COLS, list_board`.
- **HR-11 (P1)** `CleanerFlow` hard-codes `ON_SITE_M = 150` while the server enforces `marketplace_site_radius_m`. Return radius on the job payload. Also: the location override reason is collected but I did not see it sent (verify).

Interface:
- **HR-12 (P2)** Inconsistent headers and tab bar across Hire pages; missing back links.
- **HR-13 (P2)** Browse cleaners: "Top rated" on by default buries new cleaners; "Under $30" compares fixed vs hourly; no distance sort or availability.
- **HR-14 (P2)** Form details: rate field `Number(rate)` silently sends null on bad input; 15 mile default radius is large; no photo size cap. `post/page.tsx` swallows card-status failure as `has_card: true`; `flexibleMaxDays={14}` hard-coded.
- **HR-15 (P2)** Not read: `AdminPanel`, `JobsMap`, `JobLocationPicker`, `JobsList`, `ReportBlock`.

## Impact (`/impact`)

**Exists:** Community view (cleanups, bags, pounds, participants, group totals); Funding view (donated, sponsored, Plus supporters, paid out, 12-month gifts chart); You view (monthly, yearly, all-time, recap link); partner grid; "Sponsor a group"; Plus widget with 2x caps, 48h early access, recap, badge.

**Missing:** a place showing what I earned, what is pending, what was paid; iOS billing path for Plus; accessible chart labels.

- **IM-1 (P0)** Plus is a digital subscription via Stripe Checkout; Apple generally requires IAP in iOS apps (real-world services like Hire are exempt). Hide in native shell first, build IAP later. See `dev-docs/stripe-return-handoff-and-plus-iap-scoping-2026-10-29.md`.
- **IM-2 (P1)** No wallet: money lives in Earn allocations and Hire jobs with no unified view. Add Earnings to the You tab (pending, approved/owed, paid, Hire released, payout account status).
- **IM-3 (P1)** Define "Paid to neighbors" (`paid_out_cents`) as money actually transferred (Earn + Hire). Not read: how `impact.py` computes it; verify.
- **IM-4 (P2)** You tab loads every contribution row (1,000-row default cap undercounts heavy users) and matches month/year by UTC string. Move sums to SQL, use user time zone.
- **IM-5 (P2)** Gifts chart has 9px labels and hover-only tooltips (nothing on phones). Show totals as text.
- **IM-6 (P2)** Not read: billing proxy `/api/admin/payments/*` (confirm `owner_id` is checked against session user or a group they admin), `DonateCard`, `GroupSponsorCard`, `impact.py`, `services/payments.py`; rest of `SubscriptionWidget`.

## Across the tabs

- **X-1 (P0)** Test-mode copy: Earn subtitle, Earn "Start test checkout", CleanerFlow Connect copy, admin-preview labels on Plus (admin-only is fine, verify).
- **X-3 (P1)** Earn and Hire are two products with two vocabularies and two payout models. Longer term: "Find paid work" (sponsored sites + hired jobs, one wallet) and "Pay for cleanup" (sponsor a spot or hire someone), both on the Connect rail.
- **X-4 (P1)** Rollout gate is binary (`paymentsVisible(gate, isAdmin)`). Add a beta allowlist and optional pilot-area filter.
- **X-5 (P1)** Mixed auth styles: Earn/Hire use Next proxies, Perks calls FastAPI directly, billing sits under an `admin` path name. Pick one pattern for all money routes.
- **X-6 (P1)** No in-app help path for money problems, no receipts for customers or sponsors. Add a Help button on money screens with prefilled ids.
- **X-7 (P2)** Styling: visual language is consistent (zinc, emerald money, sky info, amber warnings, 44px targets). Gaps: some chips under 44px (`min-h-8` Map button, `min-h-9` chips), 9 to 11px labels, long sponsor form, tab bar shifts between 3 and 4 columns when Hire appears (keep fixed order, Hire last).
- **X-8 (P2)** Native: Stripe Checkout and Connect onboarding leave the app. Device pass on iOS and Android for card setup return, Connect return, Google OAuth fix.

## How people will use this

| Person | Tries | Breaks at |
|---|---|---|
| Regular cleaner | Claims a funded site in Earn | No status while waiting (EN-1, EN-3), no agreement or payout setup (EN-2), no earnings view (IM-2) |
| Side-hustle cleaner | Becomes a Hire cleaner, sets rate | Stripe onboarding gate, hourly implies pay it will not get (HR-1), no direct-request alert (HR-2), no earnings page (HR-8) |
| Customer | Posts job with price, adds card | No fair-price or fee sense (HR-3), empty board (HR-9), silent accept (HR-2), address visible (HR-5) |
| Sponsor | Funds a site or area | Rule vocabulary (EN-7), no receipt or fate of unspent funds (EN-5) |
| Group organizer | Hosts event in sponsored area | Group caps explained in small print, no status after logging, same manual payout |
| Perk redeemer | Spends points | Anyone can redeem as them (PK-1), staff cannot verify (PK-2) |
| Admin | Reviews, resolves disputes | Review cards lack distance/timing, no alerts, manual payouts, no dispute steps (HR-6, HR-7) |

## Sprint plan

Sizes: S under a day, M a few days, L a week or more. Assumes one pilot area and an invited cohort.

**Sprint 0: Decide (1 to 2 days, no code)**
- Fee percent and minimum job price (HR-3)
- Hourly: remove for launch or build (HR-1)
- One payout rail for Earn and Hire, or keep Earn manual for the pilot (EN-1)
- Pilot area and cohort (X-4, HR-9)
- Plus on iOS: hide or IAP (IM-1)
- Unspent sponsor money rule (EN-5)
- Accountant/lawyer check on payouts, 18+, reporting (EN-2)

**Sprint 1: Safe to take money (1 to 2 weeks)**
- Authenticate Perks endpoints (PK-1) M
- Lock and schedule `/sweep` with missed-run alert (HR-4) S
- Fuzz public job locations, hide address/polygon until accepted (HR-5) M
- Notifications on every Hire status change plus admin alerts (HR-2) M
- Fee floor and breakdown on post, accept, agreements (HR-3) M
- Hourly decision implemented (HR-1) S to L
- Earn: agreement and Connect onboarding before first payout, notifications (EN-1, EN-2) L
- Remove test-mode copy (X-1) S
- Hide Plus in native shell or start IAP (IM-1) S
- Beta allowlist (X-4) S
- Confirm migrations 121 to 125 in prod (X-2), run by user

**Sprint 2: Good enough to trust (1 to 2 weeks)**
- Earn transfers via Connect, paid state from webhook (EN-1) L
- Cleaner earnings card and Stripe dashboard link (HR-8) M
- Wallet section on Impact You (IM-2, IM-3) M
- Policy block and dispute statements (HR-7) M
- Chargeback and transfer-failure webhooks and runbook (HR-6) M
- Review cards with distance, photo timing, claimant history (EN-4) M
- Per-redemption codes and business confirmation (PK-2) M
- One redemptions request (PK-3), live radius in UI (HR-11) S
- Seed the pilot: invite cleaners, post starter jobs (HR-9)

**Sprint 3: Open the doors (ongoing)**
- Merge Earn/Hire entry points (X-3); sponsor presets (EN-7); auto-approval with audits (EN-3)
- Hire header/back-link consistency, browse sort and "New" boost (HR-12, HR-13)
- Chart and tap-target accessibility (IM-5, X-7); support entry (X-6); device pass (X-8)

## Decisions needed (recommendation first)

| Question | Recommended |
|---|---|
| Hourly pricing at launch | Remove from post form; keep rate on profiles as a guide; quote fixed prices |
| Platform fee and floor | 12 to 15% with a $15 minimum, shown to both sides; confirm against Stripe's real costs |
| Earn payouts | Move to Connect transfers before the pilot; if short on time, keep manual but collect payout method and send notifications |
| Rollout | One city, invite list, Earn and Hire on, Perks on once PK-1 ships |
| Plus on iOS | Hide in native app now; revisit IAP after pilot |
| Unspent sponsor funds | Expire after 60 days, refund remainder, rule shown before checkout |

## Running notes

Append new findings, answers to the decisions above, and status changes here as we go. Format: `YYYY-MM-DD: note (item id)`.

- 2026-10-30: Audit written from code and doc reading only. Nothing changed in code, DB or Stripe.
- 2026-10-30 DECISION (HR-1): Scrap hourly jobs for launch. Fixed price only. Keep the `price_type` column and enum so hourly and other modes can return later; hide hourly from the post form and board.
- 2026-10-30 DECISION (HR-3): Minimum job price $10. Fee should cover Stripe's cost plus about 1% for Frontline. Percent, fixed cents and minimum must all be editable in `game_settings` (no deploy). Open: Stripe alternatives (see below), and whether the fee comes out of the cleaner's payout or is added on top for the customer.
- 2026-10-30 DECISION (EN-1): Bring Earn up to parity with Hire: Connect Express onboarding for earners, transfer on approval, paid state from webhook, same notifications and agreement flow. Reuse `connect.py` and marketplace agreement gating.
- 2026-10-30 DECISION (IM-1): Leave Plus as is for now. If Apple objects, launch without Plus. Existing IAP doc covers the later move to App Store subscriptions.
- 2026-10-30 DECISION (HR-3, fee): 5% service fee, paid by the person putting money in (hirer or sponsor), added on top so the cleaner/earner nets the full posted amount. Must be changeable from `game_settings`. Caveat: 5% alone loses money under about $15 once Stripe's $0.30 is counted (at $10: fee $0.50 vs Stripe about $0.60). Recommended: 5% plus a fixed cents component (default 30, settable to 0) so the $10 minimum stays viable.
- 2026-10-30 DECISION (HR-3, final fee model): pure 5% service fee, paid by the hirer or sponsor on top, with a $15 minimum job price (replaces the earlier $10 minimum). Percent and minimum live in `game_settings`. The game settings admin page must show a break-even calculation and a warning when the current fee, fixed amount and minimum would lose money after Stripe's card fee (about 2.9% + $0.30 of the total charged) and Connect payout costs. At exactly $15 the margin is roughly break-even before Connect fees, so expect to lose a few cents per minimum-price job until volume or fee rises. A fixed-cents component can be added later if wanted.
- 2026-10-30: Backend security work is planned in `dev-docs/backend-security-plan-2026-10-30.md`. It covers PK-1, HR-4 and X-5.
- 2026-10-30 NOTE (fee math, verify against Stripe dashboard): US cards are about 2.9% + $0.30 per charge, paid by the platform because the charge is on the platform account. Connect Express adds per-active-account and per-payout fees (roughly $2/month per active account and 0.25% + $0.25 per payout; confirm current pricing). Covering card cost plus 1% means a fee of about 3.9% + $0.30 on the card side, before Connect payout costs. At the $10 minimum that is about $0.69, leaving the cleaner about $9.31.
- 2026-10-30 NOTE (Stripe alternatives): Staying on Stripe is recommended. Square, PayPal/Braintree and Adyen have similar or only slightly lower card rates, and none match Connect's split payments, onboarding and KYC for marketplaces, which is the hard part here. Real savings options: ACH debit (about 0.8%, capped at $5) for larger jobs, and batching Earn payouts to cut per-payout fees. Revisit when volume makes a 0.3% difference matter.

## UI/flow pass notes (2026-10-30)
- Hire job detail: cancel row now explains the refund and when to dispute instead.
- Support line (`components/ui/MoneySupport.tsx`) added to the Hire layout and the Earn page.
- Still open: cleaner earnings card with Stripe dashboard link, Impact wallet section, chart label accessibility, consistent Hire headers and back links, sponsor form presets, review card distance/photo timing.
- 2026-10-30 (batch 2): Impact chart has a text alternative and larger month labels; Impact has a "Your money" section linking to Earn and Hire; sponsor form has $25/$50/$100/$250 presets; allocation review cards show minutes between photos and each photo's distance from the site (flags under 5 min); browse cleaners shows a real error state instead of "no cleaners" and has 44px filter chips; `POST /sponsorships/payouts/dashboard` plus a "View earnings in Stripe" button on the Earn payout card (works for Hire cleaners too since `connect.account_for` shares the account).
- Checked and already fine: rewards tab order is fixed; every Hire subpage gets the shared back link from the layout.
- Still open: Hire home does not yet show the Stripe earnings button for cleaners; full mobile device pass; fee-on-top breakdown in the agreement text.
- 2026-10-30 (batch 3): migration 128 adds agreement v2 for cleaners and customers (fee on top, full refund on cancel before work starts, disputes hold payment, payout setup required); applied locally, users re-accept before their next job. Cleaner accept and take screens now state exactly what the cleaner receives (`EarnLine` in `JobDetail.tsx`). Hire home shows the Stripe earnings card to active cleaners with payouts on. Apply 121-128 in prod.
- Not done: mobile device pass (needs a running app on a phone or emulator).

## Mobile pass and beta access (2026-10-31)

- Beta allowlist shipped as `profiles.rewards_beta` (migration 129), admin-managed; see the security plan notes.
- Code-level mobile pass over Earn, Hire, Impact: all interactive controls raised to 44px (`min-h-11`) in marketplace (cleaner flow override link and reason field, location picker buttons, map and list chips, home actions, nav back link) and sponsorships (area builder, map chips and close button, site chips). Inputs already get 16px on coarse pointers from `globals.css`. Safe areas already use `--top-header-h` and `--bottom-nav-h`.
- Needs a real device (not verifiable from code): Stripe Checkout and Connect onboarding use `window.location` redirects. In the Capacitor wrapper an off-site navigation opens the system browser, and the return URL (`/sponsorships?checkout=success`, `?payouts=`) must come back into the app via universal link. Test on iOS and Android before launch. Also test camera capture and geolocation permission prompts in `CleanerFlow`.
