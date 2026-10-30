# Payments and Hire demo: priority checklist (2026-10-24)

Goal: get the Stripe sandbox keys onto prod and ship the Hire marketplace code to prod for an admin-only demo. Nothing here goes public. Everything stays behind the payments gate, and Hire has its own extra switch. Detail docs: `stripe-setup-and-cutover-2026-10-22.md` (section 3), `prod-sandbox-payments-setup-notes-2026-10-22.md`, `paid-cleaner-marketplace-scoping-2026-10-22.md`, `push-notifications-prod-deploy-checklist.md`.

Who does what: prod migrations, Railway variables, Vault secrets and edge function deploys are yours. Claude never runs prod writes. Claude can prepare SQL files, review diffs and write test scripts.

## State today

- Live in prod: frontend and migrations 109 to 120 from the earlier payments work. Backend deploy of that work was waiting on the Railway outage, confirm it landed.
- Local only, staged but not committed: the whole Hire marketplace (migrations 121 to 124, backend routes, services and seeder, all `/marketplace` screens, `RewardsTabs`, walkthroughs) plus the `send-push` `link_url` change.
- Stripe sandbox: webhook endpoint created, signing secret copied, Railway variables never set (outage).

## A. Stripe sandbox keys to prod (do first, small)

1. Railway backend variables: `STRIPE_SECRET_KEY` (sandbox `sk_test_`), `STRIPE_WEBHOOK_SECRET` (the prod endpoint's `whsec_`, not the local CLI one), `STRIPE_PRICE_ID_INDIVIDUAL` and `STRIPE_PRICE_ID_GROUP` (ids in the runbook). Confirm `FRONTEND_URL` is the prod frontend and `ADMIN_API_SECRET` matches the frontend.
2. Redeploy the backend.
3. Stripe dashboard "Send test webhook": expect 200 (400 wrong secret, 503 secret unset).
4. Confirm `game_settings`: `payments_admin_preview` = 1, `payments_enabled` = 0.
5. Make sure each tester has `is_admin`. Tell them: test card 4242 4242 4242 4242 only.
6. Smoke test as admin: Plus subscribe, Manage, cancel; give once; fund a sponsorship (`pending_funding` to funded); refund in Stripe (row marked refunded).
7. Check a regular user sees no Plus card, sponsorships page, Hire tab or sponsored map layer.

## B. Ship the Hire marketplace to prod for a demo

Order matters: migrations before backend, backend before frontend, otherwise the new screens call routes or tables that do not exist.

1. Commit and push. Branch `money-and-payments` is at `ec4e367` on the remote. Staged: frontend, backend, supabase. Unstaged docs, `.vscode/tasks.json` and `dev-docs/mocks/` still need a decision. Open the PR, review, merge only when you say go.
2. Apply migrations 121, 122, 123, 124 to prod (you run them). Review the SQL first. All four add new tables or columns, none touch existing data. 121 adds the `marketplace_enabled` setting at 0.
3. Deploy the backend (Railway). New routes live under `/api/marketplace`. Upload kind `marketplace` is already allowed in `upload.py`.
4. Deploy the frontend (Vercel).
5. Redeploy the edge function so push taps open the job: `supabase functions deploy send-push --project-ref nvidlxyzyoxzalxbydvg`. Then confirm the two Vault secrets exist in prod (`select name from vault.decrypted_secrets;`), and create them if not (checklist steps 1 to 4).
6. Turn Hire on for admins only: set `game_settings` `marketplace_enabled` = 1. It still needs the payments gate, so regular users see nothing.
7. Demo data: `POST /api/admin/seed/marketplace` on prod needs your go-ahead, and it creates fake cleaners and customers. Fine for a demo, remove afterward with `?remove=true`. Photos come from picsum.photos.
8. Demo walkthrough: post a job as one admin, take it as another (needs a cleaner profile and agreement), arrive and finish with photos, confirm, check notifications by email, in-app and push. Check the map, the "Map"/"Show in list" buttons, a price flag, and admin moderation at `/marketplace/admin`.

## C. Things that go with it (found while preparing this)

- [x] **Stale-job sweep** built (`run_marketplace_sweep.py`, Railway cron). Still needs `config plan` and `config apply --yes`.
- [x] **Money moves (built, unverified against Stripe).** Customer saves a card (Checkout setup). Card is charged at accept (the hold), cleaner share transferred on release via Connect, refund on cancel. Release paths: customer confirm, auto after the review window (sweep), admin "Release now" in `/marketplace/admin`. Failures set `payment_error` and retry. Needs migration 125. Cleaners need payout onboarding, posters need a test card (4242...). Connected-account webhook endpoint is optional for now.
- [ ] **Admin "Cleaners awaiting approval" queue** is now always empty because profiles save active. Hide or remove it.
- [ ] **Cleaner verification stance.** Auto-active was a deliberate call. Stripe Connect identity checks become the real gate once payouts exist. Revisit before launch with legal.
- [ ] **Tests.** The marketplace has no automated tests, and nothing was runtime-tested in a browser end to end. Do a manual pass on a phone before showing anyone.
- [ ] **Clean sandbox data out before live** (runbook section 4E): null `stripe_customer_id` on `profiles` and `groups`, delete test `subscriptions` and `sponsorships`, remove seeded marketplace rows.
- [ ] **Push still half done:** Android end-to-end test, foreground notification display (no `pushNotificationReceived` listener, see todo), merge `fix/push-notifications-ios-and-auth`.
- [ ] **Docs to finish:** capability doc and scope doc are updated for Hire. Update `todo.md` after each step here is done.

## D. Before real money (not for this demo)

Legal and tax review (marketplace of independent workers, 1099s, contractor classification), cleaner agreement review, Apple and Google in-app purchase question for native apps, live Stripe account activation and cutover (runbook section 4), dispute and chargeback handling, insurance and liability wording for cleaners and customers.

## Suggested order for the next session

1. A (Stripe keys) and its smoke test.
2. Write the sweep script and cron (C, first item), so it ships in the same PR.
3. Commit, PR, then B steps 2 to 6.
4. Demo pass on a phone, then seed data (B7).
