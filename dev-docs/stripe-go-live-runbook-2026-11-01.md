# Stripe Go-Live Runbook: sandbox to the real Stripe account (2026-11-01)

Use this when moving from the Stripe **sandbox** to your **live** account. It supersedes section 4 of `stripe-setup-and-cutover-2026-10-22.md` and adds Stripe Connect, Hire and the sweep. Stripe's dashboard menus drift, so names may differ slightly. Nothing here is run by Claude: the prod database writes, key swaps and migrations are yours.

Mode matters everywhere. Sandbox and live are two separate worlds: keys, products, prices, webhooks, customers and Connect accounts do not carry over. Every sandbox id stored in the database becomes invalid in live.

## 0. Before you start (days ahead)

- [ ] Live Stripe account activation submitted (business details, legal entity, tax id, representative identity, payout bank account). Can take days.
- [ ] Legal and tax review done (cleaner agreement, 1099 position for payouts, terms and privacy links). See `payments-v2-scoping-2026-10-15.md`.
- [ ] Decision made on Plus in the native apps (Apple IAP and Google Play Billing). See `stripe-return-handoff-and-plus-iap-scoping-2026-10-29.md`. Keep payments hidden from the native apps until settled.
- [ ] Stripe return handoff built if you want a smooth return to the mobile apps (todo.md, high priority).
- [ ] Everything tested end to end in sandbox, including the group payouts flow and a debit card Connect onboarding.
- [ ] All migrations applied to prod (you apply them). 121 to 125 verified in prod 2026-11-01, 126 to 135 being applied that day (confirm). The payments ones are 121 to 131: Hire, fee on top (126), Earn payout accounts (127), group payout accounts (131).
- [ ] Stripe 2FA on for everyone with dashboard access.

## 1. Stripe dashboard, live mode (toggle off sandbox)

### 1a. Account and branding
1. Settings > Business: public name, support email and phone, website, statement descriptor (what appears on card statements, keep it recognizable, for example FRONTLINE).
2. Settings > Branding: logo, colors, icon. Shown on Checkout, the billing portal and Connect onboarding.
3. Settings > Emails: turn on customer receipts.
4. Decide on Stripe Tax. Off is fine to start, but decide deliberately.

### 1b. Connect (cleaner and group payouts)
1. Connect > Get started. Choose **platform or marketplace**.
2. Connect > Settings > Account types: **Express**. Country: United States.
3. Complete the **platform profile** (Stripe makes you describe responsibilities for losses, refunds and chargebacks). Answers should match the terms: the platform is responsible for refunds and disputes.
4. Connect > Settings > Branding: name, icon, color shown on the Express onboarding pages.
5. Express dashboard settings: leave defaults. Cleaners open it through "See earnings" (login links).
6. Payout methods: Express onboarding collects a bank account or **debit card**. Credit cards cannot receive payouts. Stripe decides this on its own page, our app only waits for `payouts_enabled`.
7. Payout schedule: default (daily rolling) is fine. Platform balance must hold funds before a transfer: customer charges for Hire land in the platform balance first, then transfers go out.
8. Make sure the platform has a **payout bank account** and the account is **not restricted** by the review. A restricted account blocks transfers.

### 1c. Plus catalog
1. Product catalog > create product **Frontline Plus** in live mode.
2. Two recurring monthly prices: individual (currently $5) and group (currently $5, separate on purpose so the amount can change later). Label both (lookup keys such as `plus_individual_monthly`).
3. Copy the two **price ids** (`price_...`).

### 1d. Billing portal
Settings > Billing > Customer portal, **live mode**: allow cancel, update payment method, invoice history. **Save**. Without a saved live configuration, portal sessions fail.

### 1e. API key
Developers > API keys > **Secret key** (live). Copy `sk_live_...` once and put it straight in Railway.
- Using the standard secret key is the least risky. A **restricted key** is safer but must allow, at minimum: Customers, Checkout Sessions, Subscriptions, Billing Portal, Payment Intents, Charges, Refunds, Setup Intents, Payment Methods, Accounts (Connect, write), Account Links, Login Links, Transfers, Transfer Reversals read. If something fails with a permission error after switching, this is why. Start with the standard key, move to restricted later.
- The publishable key (`pk_live_`) is not used: all Stripe pages are hosted, no Stripe.js in the frontend.

### 1f. Webhooks (live mode)
The app has one endpoint: `https://<your-backend-domain>/api/payments/webhooks/stripe`. The current sandbox backend host is `frontline-production-fceb.up.railway.app`, confirm the live one.

Create the endpoint and subscribe it to these events:

| Event | Why |
|---|---|
| `checkout.session.completed` | Plus activates, sponsorships become funded, card saved for Hire |
| `customer.subscription.updated` | Plus status sync |
| `customer.subscription.deleted` | Plus ended |
| `invoice.payment_failed` | Logged for follow up |
| `charge.refunded` | Marks sponsorships refunded |
| `account.updated` | Cleaner or group `payouts_enabled` stays in sync (Connect event) |
| `charge.dispute.created` | Alerts every admin about a chargeback |
| `transfer.reversed` | Alerts every admin about a clawed back payout |

Connect events: `account.updated` is a **Connect** event (it comes from connected accounts). In the dashboard either:
- create the endpoint with "Listen to events on Connected accounts" enabled so it receives both, or
- create a second endpoint with that option on, pointing to the same URL. Each endpoint has its own signing secret. The backend accepts two secrets: `STRIPE_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`.

Copy each endpoint's **signing secret** (`whsec_...`).

Then use "Send test webhook" on the endpoint: expect **200**. 400 means wrong secret, 503 means no secret set on the backend.

## 2. Keys to copy and where they go

### Railway, backend service (replace the sandbox values, then redeploy)
| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | live `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the main live endpoint |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | signing secret of the Connect endpoint (leave empty if one endpoint receives both) |
| `STRIPE_PRICE_ID_INDIVIDUAL` | live individual price id |
| `STRIPE_PRICE_ID_GROUP` | live group price id |
| `FRONTEND_URL` | `https://www.frontlinemaps.com` (no trailing slash needed). Stripe return and refresh links are built from it. A wrong value sends users to the wrong site |
| `ADMIN_API_SECRET` | already set, must equal the value on the frontend |
| `CORS_ORIGINS` | already set, must include the live frontend origin |

Keep the sandbox values in a password manager (not in the repo) for rollback.

### Railway, sweep cron service
| Variable | Value |
|---|---|
| `API_URL` | the backend base url, no trailing slash |
| `ADMIN_API_SECRET` | same secret |

Command: `python scripts/run_marketplace_sweep.py` (from `backend/`). Schedule: every 15 minutes (`*/15 * * * *`). Confirm it succeeds once by hand: expect a JSON result and no 403.

### Vercel, frontend
No Stripe keys live in the frontend. Confirm these exist and are unchanged: `NEXT_PUBLIC_FASTAPI_URL` (the backend), `ADMIN_API_SECRET` (must match Railway), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### Supabase (prod project `nvidlxyzyoxzalxbydvg`)
Nothing Stripe specific. For push alerts on jobs and payouts, see `push-notifications-prod-deploy-checklist.md`: redeploy `send-push`, set `FIREBASE_SERVICE_ACCOUNT` and `PUSH_WEBHOOK_SECRET`, and create the two Vault secrets `push_function_url` and `push_service_role_key`.

### Anywhere else
- Stripe dashboard: add your team under Settings > Team, with the least role needed.
- Sentry (if used): confirm the backend `SENTRY_DSN` is set so webhook and transfer failures are visible.

## 3. Clear sandbox data from the prod database (easy to forget)

Sandbox ids are meaningless in live. `profiles.stripe_customer_id` and `groups.stripe_customer_id` are cached and reused, so a stale sandbox customer id makes every live call fail with "No such customer". Cleaner and group Connect account ids (`cleaner_profiles.stripe_connect_account_id`, and the group equivalent) are also sandbox only.

Write this as a reviewed SQL file, run it **read only first**, check the counts, then run it yourself:
- [ ] Null `stripe_customer_id` on `profiles` and `groups`.
- [ ] Clear the sandbox Connect accounts so everyone re-onboards in live: set `stripe_connect_account_id = NULL` and `payouts_enabled = false` on `cleaner_profiles`, `payout_accounts` and `group_payout_accounts`.
- [ ] Delete sandbox `subscriptions` rows (including `mock_` rows).
- [ ] Delete sandbox `sponsorships` rows, and their allocations: pending_funding, refunded, mock funded.
- [ ] Delete test Hire jobs and their payment rows (anything with a sandbox payment intent or charge id), and remove seeded marketplace data (`POST /api/admin/seed/marketplace` with `remove=true`).
- [ ] Optionally clear `stripe_webhook_events`.
- [ ] Look at the Impact page, the Earn page and the sponsored map afterwards.

## 4. Settings to check in Admin > Settings > Payments

- [ ] `payments_enabled` = off, `payments_admin_preview` = on, `marketplace_enabled` = on. You test as an admin before the public sees anything.
- [ ] `marketplace_platform_fee_percent` = 5.5 (migration 126 sets it). Use the Hire fee check to confirm the break even.
- [ ] Hire minimum price, Earn caps and the Plus multiplier are the values you want live.

## 5. Go-live test (real money, as an admin, small amounts)

Do all of this with `payments_enabled` off and admin preview on.

1. **Plus:** subscribe for real ($5), confirm the webhook returned 200 in the live dashboard (Developers > Webhooks), the Plus card shows active, Manage opens the portal, then cancel and refund in the dashboard.
2. **Sponsorship:** fund a small site with a real card. It should go from pending_funding to funded. Refund it and check it marks refunded.
3. **Cleaner payout:** onboard a real cleaner account (yours) with a real bank or debit card. Confirm "Payouts are on" appears (status updates through `account.updated` or the status check).
4. **Earn:** claim the funded site, submit before and after photos, approve it as admin, and confirm a transfer appears in Stripe (Balances, Transfers) and the allocation shows paid out.
5. **Group payouts:** repeat with a group payout account and a sponsored event.
6. **Hire:** post a $15 job, take it with a second account, confirm the card is charged price plus 5.5% fee, finish the job, confirm and rate, and confirm the transfer to the cleaner for the full $15. Then test a cancel with refund.
7. **Sweep:** confirm the cron ran (Railway logs) and that stopping it for a while triggers the admin alert.
8. **Alerts:** use "Send test webhook" for `charge.dispute.created` and check admins get the notification.
9. Look at Developers > Logs and Events for any 4xx or 5xx.

## 6. Public launch

1. Everything above is green.
2. Set `payments_enabled` = on. The Hire tab shows for everyone only when `marketplace_enabled` is also on.
3. Watch the first day: Stripe dashboard Payments and Transfers, Railway logs, admin notifications.

## 7. Rollback

- First move: set `payments_enabled` = off. Money features hide, nothing in Stripe is lost.
- To go back to sandbox: put the saved sandbox values back in Railway and redeploy. Live customers and subscriptions made in the meantime are then unreachable from the app, so if real users have paid, fix forward or pause with the switch instead.
- Incident steps: `payments-incident-runbook.md`.

## 8. Known open items that affect launch

- Mobile return from Stripe (bounce page and custom scheme) is not built yet.
- Native app Plus purchase (IAP) is undecided and blocks showing Plus in the store apps.
- Debit card only payee onboarding is untested.
- Earn approval is fully manual (see the Earn approval notes in `payments-admin-guide-2026-11-01.md`).
