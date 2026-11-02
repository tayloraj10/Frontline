# Payments Admin Guide (2026-11-01)

The full reference for how money works in Frontline. A short version of sections 1 to 7 lives in the app at Admin > Settings ("How payments work: admin guide"). Prod setup and going live are deliberately **not** in the app, they live here and in `stripe-go-live-runbook-2026-11-01.md`.

## TL;DR

- Stripe moves all money. Our database mirrors it through webhooks.
- Four flows: Plus subscriptions, sponsorships (pools), Earn payouts, Hire jobs.
- Payees (cleaners, groups) get paid through Stripe Connect Express accounts. We never see bank details.
- Earn: a sponsor funds a pool, a cleaner claims and submits photos, an admin approves, and the transfer is automatic.
- Hire: the customer pays price plus a 5.5% fee on top when a job is taken, the money is held, and it is released to the cleaner when the customer confirms (or 3 days after the cleaner finishes).
- Three switches control visibility: payments_enabled (go live), payments_admin_preview (admins only), marketplace_enabled (Hire tab, needs one of the first two).
- A 15 minute sweep cron keeps Hire moving. Chargebacks, reversed payouts and a stalled sweep alert every admin.

## 1. The big picture

Four money flows, all on Stripe:
- **Frontline Plus:** $5 a month, for a person or a group. Checkout and the billing portal are Stripe pages.
- **Sponsorships:** a sponsor funds a cleanup site or area (a pool), or gives to Frontline or a group. One time Stripe Checkout payment.
- **Earn payouts:** cleaners and groups are paid from a sponsor pool after an admin approves the work.
- **Hire:** a customer posts a paid cleaning job, a cleaner takes it, the customer pays, the cleaner is paid.

Payees use **Stripe Connect Express** accounts. They add a bank account or debit card on Stripe's pages (credit cards cannot receive payouts). We only keep the account id and a `payouts_enabled` flag. Tables: `cleaner_profiles` (Hire cleaners), `payout_accounts` (any user, Earn), `group_payout_accounts` (groups).

## 2. Who sees what (the three switches)

- `payments_enabled`: the full go-live switch. Off means normal users see no money features.
- `payments_admin_preview`: shows money features to site admins only. Use it to test in prod.
- `marketplace_enabled`: shows the Hire tab. It also needs payments_enabled (everyone) or payments_admin_preview (admins only). Marketplace on with both payments switches off shows nothing.
- Per user, the rewards beta flag (Admin, Admins tab) lets a chosen non admin see Earn and Impact early.
- Settings shows a "Right now" line that says who can see the features at the current positions.
- Test vs live Stripe is decided by the backend key (`sk_test` or `sk_live`), not by an admin setting.

## 3. Frontline Plus

- Subscribe through Stripe Checkout. The webhook writes a `subscriptions` row. The app only reads its status (active or trialing means Plus).
- Manage and cancel happen in the Stripe billing portal. Cancelling keeps Plus until the period ends.
- Perks: early access to newly funded sites, a higher earning cap, the monthly recap, a supporter badge and insights.
- The cap boost is `plus_earning_cap_multiplier` applied to the base caps. Settings shows base and Plus caps side by side.
- Group Plus is bought by a group admin and uses its own price.

## 4. Sponsorships and Earn

Funding:
- A sponsor picks a site or area, sets a total and a payout rule, and pays by Checkout. The row starts pending_funding and becomes funded when the webhook arrives.
- Payout rules: one payout (first approved cleaner takes all), fixed amount per cleanup, per bag, per attendee (areas only). The last payout gets the remainder.
- A funded pool closes when it runs out. Plus members get early access.

Earning:
- Sites: a signed in cleaner claims a pin and must be at the site. They have 30 minutes for the before photo and 2 hours for the after photo. Running out reopens the site.
- Areas: a group schedules a cleanup event inside the area and marks it sponsored. Once verified, the group earns from the pool.
- Caps (Settings > Payments > Earn) limit what one person can earn per pool, per day. Plus raises them.

Approval (current behavior):
- Every submission creates an allocation in `pending_review`. **An admin must approve each one.** Nothing is automatic.
- Approving checks the pool still has the money, then **pays automatically**: a Stripe transfer to the recipient (`earn_payouts.pay_allocation`, idempotent per allocation). If the recipient has no ready payout account, the allocation stays `approved` and is paid when they finish setup.
- Rejecting notifies the cleaner with a reason.
- Checks already enforced at submission: the cleaner must be near the site, within the time windows, with an after photo, and under the caps.

Getting paid:
- Individuals set up payouts on the Earn page ("Earnings and payment info"). Groups set up a separate account on the group edit page, and group admins see an amber banner on the group page until it is done.
- "See earnings" opens the Stripe Express dashboard. "Update payment info" reopens Stripe onboarding.
- A group with no payout account cannot host a sponsored event or take direct gifts.

## 5. Hire (paid cleaning jobs)

Money path:
- The customer saves a card, then posts a job at a price. The first cleaner to take it gets it, and only then is the card charged.
- The charge is price plus the Frontline fee (`marketplace_platform_fee_percent`, default 5.5). The fee is paid on top by the customer, so the cleaner nets the full posted price.
- The charge sits in the platform Stripe balance. That is the hold. Nothing goes to the cleaner yet.
- The customer confirms and rates, which transfers the price to the cleaner's Express account. With no action it auto releases 3 days after the cleaner finishes.
- A dispute opened before release freezes the money until an admin resolves it.
- Cancel before work starts, or a no show, refunds the customer. Every Stripe call has an idempotency key, so retries never double charge or double pay.

Fee and break even:
- Stripe charges 2.9% plus 30 cents. At the $15 minimum job about 5.05% covers it, so 5.5% breaks even and earns a little more on larger jobs. The Hire fee check in Settings tests any fee, price and Stripe rate.

Protections:
- One active job per cleaner. A start by time applies, missing it returns the job to the board with a strike.
- Backing out after the start time is a strike. 3 strikes in 90 days suspends the cleaner until an admin reinstates them.
- Chat blocks phone numbers, emails and links. Abusive messages appear under Flagged messages.
- The address is hidden until a cleaner takes the job.

## 6. Webhooks and the sweep

One endpoint, `POST /api/payments/webhooks/stripe`. Duplicate deliveries are ignored by event id.
- `checkout.session.completed`: activates Plus, marks a sponsorship funded, saves a Hire card.
- `customer.subscription.updated` and `.deleted`: Plus status.
- `invoice.payment_failed`: logged.
- `charge.refunded`: marks a sponsorship refunded.
- `account.updated`: keeps a payee's `payouts_enabled` in step with Stripe.
- `charge.dispute.created`, `transfer.reversed`: every admin gets an alert. Review in Stripe before any related payout moves.

The **sweep** (`POST /api/marketplace/sweep`, secret protected) runs every 15 minutes from a Railway cron. It expires stale jobs, returns no shows to the board, applies strikes and auto releases confirmed jobs. If it stops, jobs stop moving and admins are alerted when it has been silent too long.

## 7. Day to day

- **Approve work:** review sponsored cleanups and events waiting. Approving pays.
- **Disputes:** read the chat and photos, then refund the customer or release to the cleaner.
- **Strikes:** reinstate a suspended cleaner after a conversation.
- **Alerts:** chargebacks, reversed payouts and a stalled sweep arrive as admin notifications.
- **"I was not paid":** check their `payouts_enabled` first. If Stripe onboarding is unfinished nothing can transfer. Then check Transfers in the Stripe dashboard.
- **Refunds:** issue them in the Stripe dashboard, the webhook updates our rows.
- Incident steps: `payments-incident-runbook.md`.

## 8. Prod setup and going live

See `stripe-go-live-runbook-2026-11-01.md` (every Stripe, Connect, Railway, Vercel and Supabase step, in order, with the keys to copy). The sandbox setup history is in `stripe-setup-and-cutover-2026-10-22.md` and `prod-sandbox-payments-setup-notes-2026-10-22.md`.

## 9. Open items

- Mobile return from Stripe (bounce page plus custom scheme): scoped, not built.
- Plus in the native apps needs an IAP decision.
- Debit card only onboarding is untested.
- Earn approval is fully manual: see todo.md for the automation item.
