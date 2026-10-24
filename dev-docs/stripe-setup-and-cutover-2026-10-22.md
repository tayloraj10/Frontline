# Stripe setup, local testing and production cutover (2026-10-22)

Covers Frontline Plus (subscriptions) and sponsorships (one-time payments). Payouts to earners (Stripe Connect) are not built, see `payments-v2-scoping-2026-10-15.md`. Stripe dashboard layout changes often, so menu names below may drift.

## 1. Current setup (sandbox)

- Stripe **sandbox** account (Stripe's newer form of test mode: test keys, test cards, separate from live, no real money).
- Product "Frontline Plus" with two recurring $5/month prices, set up 2026-10-22 (price IDs are sandbox only and are not secrets):
  - Individual: `price_1UTQfsRo04cwtN6Ybgh2Pd5S` (`STRIPE_PRICE_ID_INDIVIDUAL`)
  - Group: `price_1UTQi7Ro04cwtN6Y3g2LN7ZR` (`STRIPE_PRICE_ID_GROUP`). Separate price on purpose: a Stripe price's amount cannot be edited, so a separate group price lets the group amount change later by swapping the ID.
  - Label each price in the dashboard (price `...` menu, Edit price, description or lookup key, e.g. `plus_individual_monthly`).
- Customer portal configured and saved (Settings > Billing > Customer portal). The app creates portal sessions via the API, so the no-code "Activate test link" button is not needed. A saved configuration is required or the Manage subscription button errors. Leave the "next generation portal" preview toggle off. Customers must be allowed to cancel.
- Backend env vars (`backend/.env`, template in `backend/.env.example`): `STRIPE_SECRET_KEY` (`sk_test_...`), `STRIPE_WEBHOOK_SECRET` (`whsec_...`), `STRIPE_PRICE_ID_INDIVIDUAL`, `STRIPE_PRICE_ID_GROUP`. Never paste secret keys or `whsec_` values into chat or docs. The frontend needs no Stripe vars (it needs `ADMIN_API_SECRET`, same as the backend).
- Webhook handler: `POST /api/payments/webhooks/stripe` (`backend/app/api/routes/payments.py`). Events handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `charge.refunded`. Duplicate deliveries are ignored via `stripe_webhook_events`.

## 2. Local testing

### One-time
1. Install the CLI: `winget install Stripe.StripeCli` (1.55.0 installed 2026-10-22). The PATH only updates in new shells. If `stripe` is "not recognized" even in a fresh terminal, run it by full path: `& "$env:LOCALAPPDATA\Microsoft\WinGet\Links\stripe.exe" <args>`. Fully restarting the terminal app or signing out fixes plain `stripe`.
2. `stripe login`, choose the **sandbox** account (not live), click Allow access. The login expires after about 90 days, then repeat.
3. Start the listener once manually to get the signing secret: `stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed,charge.refunded --forward-to localhost:8000/api/payments/webhooks/stripe`. Newer CLIs require `--events` (or `--all-snapshot`). It prints `whsec_...`. Put it in `backend/.env` as `STRIPE_WEBHOOK_SECRET` and restart the backend. The CLI secret is tied to the CLI login, so it normally stays the same between runs. If webhooks start failing signature checks, rerun and compare.

### Why the listener is needed
Stripe's servers cannot reach `localhost`. The CLI opens an outbound connection and carries events to the local backend. Without it, checkout itself still works and redirects back, but the database never learns about the payment (no `subscriptions` or `sponsorships` updates). In prod, a real webhook endpoint replaces it, no CLI involved.

### Automatic start
VS Code task **Stripe: Webhook Listener** in `.vscode/tasks.json` runs the listener and is a dependency of **Start Frontend + Supabase**, so it starts with the full stack job. It runs `stripe.exe` by full path, so PATH does not matter. The backend itself is still started separately.

### Test checklist
- Test cards: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (declined), `4000 0025 0000 3155` (3D Secure). Any future expiry, any CVC, any postal code.
- As an admin with `payments_admin_preview` on: subscribe to Plus on your profile, check the Plus card updates, open Manage subscription (portal), cancel, and check the status change.
- Give once ("Or give once", general fund) and check a `sponsorships` row goes from `pending_funding` to funded.
- Group Plus and the group Support card.
- Sponsored site or area sponsorship funding.
- Refund a payment in the dashboard and check `charge.refunded` marks the sponsorship refunded.
- Failed renewal: Stripe test clocks or the `4000 0000 0000 0341` card (attaches fine, fails on charge), and check `invoice.payment_failed` is logged.
- Watch the listener window and backend logs for non-2xx responses. Stripe dashboard > Developers > Webhooks or Events shows each delivery and lets you resend.
- Mock rows (`mock_...`) from the seeder have no real Stripe customer, so the portal button fails on them. Expected.

## 3. Prod with sandbox keys (testing with other admins)

Goal: the deployed app uses the Stripe **sandbox**, so you and other site admins can test Plus and sponsorships on prod without real money. Regular users see nothing.

### Who can see and use it
- Payments UI is shown only to site admins (`is_admin`) while `payments_admin_preview` = 1 and `payments_enabled` = 0 (both are `game_settings`, defaults set by migrations 113-114). Non-admins see no payment UI anywhere.
- Other testers need `is_admin` on their profile. Grant it from the admin roles tooling, or with an UPDATE you run yourself. Remove it when they are done.
- Every tester can use any sandbox test card. Tell them clearly: **use only test cards (`4242 4242 4242 4242`), never a real card.** Sandbox rejects real cards anyway, but a failed real-card attempt is confusing and looks bad.

### Setup (one-time, in order)
1. Stripe dashboard, sandbox: Developers > Webhooks > add endpoint `https://<railway-backend>/api/payments/webhooks/stripe` with the five events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `charge.refunded`). Copy this endpoint's own signing secret. It is a different `whsec_` from the local CLI one. Do not reuse the local one.
2. Railway backend env vars:
   - `STRIPE_SECRET_KEY` = the sandbox `sk_test_...` key
   - `STRIPE_WEBHOOK_SECRET` = the endpoint's `whsec_...` from step 1
   - `STRIPE_PRICE_ID_INDIVIDUAL` = `price_1UTQfsRo04cwtN6Ybgh2Pd5S`
   - `STRIPE_PRICE_ID_GROUP` = `price_1UTQi7Ro04cwtN6Y3g2LN7ZR`
   - Already set, confirm: `ADMIN_API_SECRET` (must match the frontend value exactly) and `FRONTEND_URL` (the prod frontend URL, used for Checkout success and cancel redirects).
3. Deploy the backend (re-trigger after the Railway build outage if needed). The frontend and migrations 109-120 are already live. The frontend needs no Stripe vars.
4. Check the endpoint: in the Stripe dashboard use "Send test webhook". It should return 200. A 400 means a wrong `whsec_`, a 503 means `STRIPE_WEBHOOK_SECRET` is unset in Railway.

### Test as each admin
- Plus: subscribe on your profile, confirm the Plus card, open Manage subscription, cancel.
- Give once and sponsorship funding with a test card, then watch the sponsorship go from pending to funded.
- Refund from the sandbox dashboard and confirm the row is marked refunded.
- Check each webhook delivery in the sandbox dashboard (Developers > Webhooks > the endpoint > recent deliveries). Resend any failures after fixing.

### Check non-admins still see nothing
Log in as a regular user (or a private window): no Plus card, no sponsorships page, no sponsored map layer, Impact page not reachable. Leaderboards, groups and events load normally.

### Caveats
- All of this data is sandbox data. Sandbox customer IDs get cached on `profiles` and `groups` (`stripe_customer_id`), and subscriptions and sponsorships rows will exist. They must be cleaned out before live (section 4E).
- Sandbox funding is not real money, so the Impact page and sponsor totals will show test numbers to admins. Do not screenshot those as real figures.
- The prod seed endpoint (`/admin/seed/payments-mock`) creates `mock_` rows with no Stripe customer, which can't use the portal. Avoid mixing them with real sandbox tests unless intended.
- Do not tell anyone this is live billing. If a tester needs to test as a non-admin, flip `payments_enabled` to 1 only on an environment where that is acceptable. Not on prod.
- Rotate or delete the sandbox key if it is ever shared outside Railway.

## 4. Cutting over to live Stripe (real money)

Do not do this before the work in `payments-v2-scoping-2026-10-15.md` is done (legal and tax review, payout rules, in-app billing decision for native apps). Cutover is a separate, deliberate step.

### A. Stripe account
1. Activate the live account: business details, legal entity, tax ID, representative identity, payout bank account. Verification can take days, so start early.
2. Set public business info: business name, support email and phone, statement descriptor (what shows on card statements), logo and brand colors for Checkout and the portal, privacy policy and terms URLs.
3. Decide on Stripe Tax (sales tax or VAT on subscriptions) and customer receipts (Settings > Emails).
4. Review Radar defaults, and set up dashboard users and 2FA for anyone with access.

### B. Recreate the catalog in live mode
Sandbox objects do not exist in live. Switch to live mode and create the Plus product and both $5/month prices again (or use "copy to live mode" if the dashboard offers it, then verify). Label them the same way. They get new price IDs.

### C. Recreate the customer portal in live mode
The portal configuration is per mode. Redo Settings > Billing > Customer portal in live mode and save (cancel allowed).

### D. Keys and webhook
1. Create a **live** secret key. Prefer a restricted key limited to what the backend uses (Checkout Sessions, Customers, Subscriptions, Billing Portal, Payment Intents and Charges read) over the full `sk_live_` key.
2. Add a **live** webhook endpoint (same URL and same five events). It has its own new `whsec_`.
3. Railway env: replace `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_INDIVIDUAL` and `STRIPE_PRICE_ID_GROUP` with the live values, then redeploy. Keep the sandbox values somewhere safe (a password manager, not this repo) for rollback.

### E. Clean sandbox data out of the prod database (easy to miss)
Customer, subscription and price IDs from the sandbox are meaningless in live. The code caches `stripe_customer_id` on `profiles` and `groups` (`get_or_create_customer` returns the cached ID), so a stale sandbox customer ID would make every live call fail with "No such customer". Before going live:
- Null out `stripe_customer_id` on `profiles` and `groups`.
- Delete test `subscriptions` rows (including seeded `mock_` rows).
- Delete test `sponsorships` rows, including any `pending_funding`, refunded or mock-funded rows. Check the Impact page and sponsored map layer afterwards.
- Optionally truncate `stripe_webhook_events`.
Write this as a reviewed SQL file, check it against prod read-only first, and run it yourself. Claude does not run prod writes.

### F. Go-live test
1. With `payments_enabled` still 0 and admin preview on, do a real small purchase with a real card (the $5 Plus price) as an admin. Confirm the webhook returns 200 in the live dashboard, the `subscriptions` row appears, and the portal opens.
2. Cancel and refund that test purchase. Confirm `charge.refunded` is handled.
3. Test a one-time sponsorship the same way and refund it.
4. Check the live dashboard Events and Logs for any failures.

### G. Public launch
Only after the above and the open items in the scoping doc: set `payments_enabled` = 1. For native apps, resolve the Apple and Google in-app purchase question first (see the open decision in `payments-v2-scoping-2026-10-15.md`). Hide payments from regular users at any time by setting `payments_enabled` back to 0.

### H. Rollback
Put the sandbox env vars back in Railway and redeploy. Live customers and subscriptions created in the meantime would then be unreachable from the app, so if real users have paid, prefer fixing forward or pausing with `payments_enabled` = 0.

## 5. Not covered here

- Stripe Connect for payouts to earners and cleaners (identity verification, transfers, 1099s). Separate build, shared with `paid-cleaner-marketplace-scoping-2026-10-22.md`.
- Refund and dispute handling beyond `charge.refunded` (chargebacks need a handler and an admin view).
