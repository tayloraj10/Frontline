# Prod sandbox payments setup: progress notes (2026-10-22)

Goal: let site admins run the Stripe test payment flows on prod. Full runbook: `stripe-setup-and-cutover-2026-10-22.md`, section 3. These notes only track where we stopped.

## Done
- Branch pushed and PR written (frontend only, no migrations or backend changes).
- Stripe sandbox webhook endpoint created: `https://frontline-production-fceb.up.railway.app/api/payments/webhooks/stripe`. Scope "Your account", payload style Snapshot, five events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `charge.refunded`.
- Endpoint signing secret copied (kept out of the repo and chat).

## Blocked
- Setting Railway backend env vars. Railway outage on 2026-10-22, variables page unavailable.

## Left, in order
1. Railway backend variables: `STRIPE_SECRET_KEY` (sandbox `sk_test_`), `STRIPE_WEBHOOK_SECRET` (the endpoint's `whsec_`), `STRIPE_PRICE_ID_INDIVIDUAL`, `STRIPE_PRICE_ID_GROUP` (ids in the runbook). Confirm `FRONTEND_URL` and that `ADMIN_API_SECRET` matches the frontend.
2. Deploy the backend (picks up the variables).
3. Stripe "Send test webhook": expect 200 (400 wrong secret, 503 secret unset).
4. Confirm `game_settings`: `payments_admin_preview` = 1, `payments_enabled` = 0. Testers need `is_admin`.
5. Admin test on prod with card 4242 4242 4242 4242 only: Plus subscribe, Manage, cancel; give once; fund a sponsorship (`pending_funding` to funded); refund in Stripe (row marked refunded); check webhook deliveries.
6. Check a regular user sees no Plus card, sponsorships page or sponsored map layer.

## Later (this branch's priorities)
- Paid cleaner marketplace UI and a revamp of the Rewards cards, Sponsorships page and Impact page (mocks first).
- Stripe Connect payouts in test mode. Today `paid_out` is a manual flag and no money moves.
- Sandbox customers and sponsorship rows on prod must be cleaned out before going live (runbook section 4E).
