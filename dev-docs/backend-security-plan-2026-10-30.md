# Backend Endpoint Security Plan (2026-10-30)

Goal: secure the Earn, Hire, Impact (and Perks) endpoints first, and make them the template for securing the rest of the FastAPI backend. Related: `dev-docs/rewards-launch-audit-2026-10-30.md` (PK-1, HR-4, X-5).
Artifact: none for this doc. This md file is the source of truth.

## What the code does today (verified by reading)

- `backend/app/main.py` mounts every router under `/api` with no global auth. Only `admin.router` is excluded in production.
- Two auth styles exist today:
  - Shared secret in the `X-Admin-API-Secret` header, checked per router. The check is copy-pasted in `admin_prod.py`, `payments.py`, `sponsorships.py`, and `marketplace.py` (`actor()`), and compares with `!=` (not constant time).
  - Nothing at all, for example `partners.py` (browser sends `user_id`) and `POST /marketplace/sweep`.
- Marketplace identity comes from `X-Acting-User-Id` / `X-Acting-Is-Admin` headers set by the Next proxy. Those are only as trustworthy as the secret. A leaked secret means anyone can act as any user or admin.
- The Earn proxies (`/api/sponsored/[...path]`, `/api/admin/sponsorships`) derive identity from the session server side, which is good.
- CORS allows all methods and headers with credentials and an origin regex (`cors_origin_regex`). Check the regex is tight.

## Not yet audited (unknown, do not assume safe)

Routers with no review yet: `contributions`, `events`, `cleanup_events`, `team_events`, `groups`, `users`, `account`, `device_tokens`, `upload`, `problem_reports`, `content_flags`, `leaderboard`, `tiles`, `geo_units`, `campaign_dashboard`, `decay`, `admin_roles`. Each needs an endpoint-by-endpoint table (method, path, who may call, identity source, ownership check).

## Target design (the template)

One module, `backend/app/core/auth.py`, with three FastAPI dependencies. Every route declares exactly one.

1. `require_user` : verifies the caller's Supabase access token (JWT) from `Authorization: Bearer`, returns a `CurrentUser(id, email, is_admin)`. Identity is proven cryptographically, so no `user_id` in bodies or queries, and it works for the web app, the Capacitor app and any future client without a proxy.
2. `require_admin` : `require_user` plus an admin check against the database (not a header).
3. `require_service` : for server-to-server callers only (Next proxy where needed, Stripe/cron/sweep). Uses `hmac.compare_digest` on a secret; fails closed with 503 if the secret is unset.

Rules that go with it:
- Public routes are listed explicitly in one allowlist (health, public map tiles, public stats). Anything else without a dependency fails a test.
- Ownership checks live in the service layer (`job.customer_id == user.id`), not in the route or the proxy.
- Stripe webhooks keep signature verification, never the shared secret.
- Remove the per-router `_check_secret` copies once migrated.
- Add rate limits on money and write routes (per user and per IP).
- Add a test that walks `app.routes` and fails if any non-allowlisted route lacks an auth dependency. This is what keeps the rest of the backend from regressing.

## Order of work

1. Add `core/auth.py` and the route-walk test (test starts with a large allowlist of unaudited routers and shrinks over time).
2. Hire: replace `actor()` and the acting-user headers with `require_user` / `require_admin`; lock `/sweep` with `require_service`; schedule it.
3. Earn (`sponsorships.py`, `sponsored_cleanups.py`): same swap; keep the Next proxies but they forward the user's token instead of vouching with headers.
4. Impact and billing (`payments.py`, `impact.py`): `require_user` for owner-scoped routes, check `owner_id` is the caller or a group they admin; summary endpoints that are public get an explicit allowlist entry.
5. Perks (`partners.py`): add `require_user` to redeem, my-redemptions, mark-used; add business-admin checks on business routes.
6. Roll the same pattern across the unaudited routers, one router per PR, using the route table as the checklist.
7. Tighten CORS (specific methods/headers, verify the origin regex), add security headers, and review Supabase RLS for tables the browser reads directly.

## Open questions

- Does the Supabase project sign JWTs with an asymmetric key (JWKS) or the legacy shared HS256 secret? This decides how `require_user` verifies tokens. Verify in the Supabase dashboard before building.
- Keep the Next proxies for Hire and Earn, or let the browser call FastAPI with its bearer token? Recommendation: keep the proxies where they add value (hiding the backend URL, SSR calls) but have them forward the token, so FastAPI never trusts caller-supplied identity.
- Production secret rotation: `ADMIN_API_SECRET` should be rotated once the headers are gone from the code path. User runs deploys and env changes.

## Settled decisions (2026-10-30)

- **Scope:** only the three new pages, Earn, Hire and Impact (their routers: `sponsorships`, `sponsored_cleanups` paths, `marketplace`, `payments`, `impact`). All three are new in prod and admin-only, so this is the safe place to prove the pattern. No other router is touched until this is working and reviewed. This overrides steps 5 to 7 above for now: Perks and the unaudited routers are a later phase.
- **Rollout:** enforce directly, no log-only mode, because only admins can reach these pages in prod today. Re-evaluate before opening the payments gate to non-admins.
- **Proxies:** keep the Next proxies for Hire and Earn and forward the user's Supabase token. FastAPI verifies it and no longer trusts `X-Acting-*` headers.
- **Rate limits:** in-memory per instance for the pilot. Move to Redis only if Railway runs multiple instances at scale.
- **Perks (later phase):** go through a Next proxy like the other money routes. Reason: one pattern for everything that moves points or money, and a proxy lets the server attach the token and keeps the backend URL out of the browser. User deferred this choice to the recommendation.
- **JWT signing (confirmed by user):** ECC (P-256), asymmetric. `require_user` verifies ES256 tokens against the project's public JWKS (`https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`), cached with a short TTL and refetched on an unknown `kid`. No signing secret is stored in the backend; the only new config is the project URL (already `SUPABASE_URL`). Also check issuer (`<url>/auth/v1`) and audience (`authenticated`), and reject expired tokens. Local dev Supabase may sign differently, so test locally against its own JWKS endpoint.
- **Status:** all questions settled. No work starts until the user says go.

## Running notes

- 2026-10-30: Plan drafted after reading `main.py`, `config.py`, and the auth helpers in `admin_prod.py`, `payments.py`, `sponsorships.py`, `marketplace.py`. No code changed.
- 2026-10-30 (implementation, uncommitted on `money-and-payments`):
  - Added `backend/app/core/auth.py` (`require_user`, `require_admin`, `require_service`; ES256/RS256 via JWKS, issuer/audience/exp checked, HS256 rejected, constant-time service secret) and `PyJWT[crypto]==2.9.0` to requirements.
  - Tests: `backend/tests/test_route_auth.py` (route walk over `/api/marketplace`, `/api/payments`, `/api/sponsorships`; only the Stripe webhook is exempt) and `tests/test_auth_tokens.py`. Add a prefix to `AUDITED_PREFIXES` as each router is migrated.
  - Hire: `actor()` now built on `require_user` plus a DB admin lookup; `X-Acting-*` headers gone; `/sweep` needs `require_service`; `scripts/run_marketplace_sweep.py` sends the secret.
  - Earn: `sponsorships.py` uses `require_user` / `require_admin`; user ids in bodies/queries are ignored (taken from the token); business sponsorship membership is checked server side.
  - Impact/billing: `payments.py` uses `require_user`; owner check (self, group admin, site admin) on checkout/portal; entitlement returns only `has_premium` to non-owners (flair stays public).
  - Next side: new `lib/fastapiAuth.ts` `authHeader()`; marketplace `mkFetch`, the sponsored proxy, admin sponsorships/payments routes, impact page and `plus.server.ts` forward the user's token.
  - Not yet: rate limits, CORS tightening, Perks (`partners.py`), local-Supabase JWKS check, secret rotation.
  - User actions needed before deploy: add `ADMIN_API_SECRET` to the Railway sweep cron service env; keep it on the API and Vercel (still used by `admin_prod` routes); confirm prod `SUPABASE_URL` is the project URL whose `/auth/v1/.well-known/jwks.json` serves the ES256 key.
- 2026-10-30 (later): in-memory per-user rate limits (`core/rate_limit.py`: 10/min money, 60/min other writes) on all Hire, Earn and billing write routes; CORS methods and headers narrowed to what browsers send.
- 2026-10-30 (Hire money): migration 126 adds `marketplace_jobs.fee_on_top` and `marketplace_min_job_cents` (1500), sets the fee to 5 percent. New jobs are fixed price only, the hirer pays price plus fee, the cleaner nets the full price. Old jobs keep the deduct model via `fee_on_top = false`. `GET /marketplace/pricing` feeds the post form fee breakdown. Local DB had 123 applied by hand, so 126 was applied directly with its SQL; the user applies 121-126 to prod.
- 2026-10-30 (Hire privacy and settings): board listings hide address, area and radius and coarsen the pin for non-owners; job payload now carries `on_site_m` (from `marketplace_site_radius_m`) so `CleanerFlow` no longer hard-codes 150 m. The game_settings Payments group shows a live break-even table (`HireFeeCheck` in `AdminPanel.tsx`) using Stripe 2.9% + $0.30 on price + fee. Finding: at the $15 minimum, a 5% fee nets about -$0.01 per job (break-even is 5.05%). Raise the fee to 6% to cover Stripe plus about 1%, or raise the minimum.
- 2026-10-30 (Earn payout parity): migration 127 adds `payout_accounts` (Connect account for any user; cleaners' existing account on `cleaner_profiles` is reused, `connect.account_for`) and `sponsorship_allocations.stripe_transfer_id` / `payout_error`. Approving an individual allocation now notifies the worker and calls `services/earn_payouts.pay_allocation` (Stripe transfer, idempotency key `earn-transfer-{id}`, `source_transaction` from the sponsorship's PaymentIntent). No payout account yet: allocation stays `approved`, worker is told to set up payouts, admin can retry with `POST /sponsorships/allocations/{id}/pay`. Rejection also notifies. New worker routes `GET /sponsorships/payouts/status` and `POST /sponsorships/payouts/onboard`, proxied through `/api/sponsored`. Group allocations (no single recipient) still use the manual "Mark paid out" flag. Earn page shows `PayoutSetupCard` until payouts are ready. Test-mode copy removed. Apply 127 in prod with the others.
- 2026-10-31 (beta allowlist): migration 129 adds `profiles.rewards_beta` (default false). `profiles_update` RLS lets users edit their own row, so a trigger (`guard_rewards_beta`) rejects changes from anyone who is not a site admin or the service role. `rewardsVisible(gate, isAdmin, beta)` is used only by Earn, Impact, Hire (`getMarketplaceAccess`), the Earn proxies, `impact-summary`, and the Perks page tab bar. Perks itself and Plus billing still use `paymentsVisible`. Admin toggle: Admin > Admins tab > "Rewards beta testers". The `preview` kill switch still hides everything for everyone. Caveat: this gate lives in the Next layer; FastAPI verifies identity but does not check the beta flag, so a signed-in non-beta user holding a valid token could call FastAPI directly. Same as before the flag existed.
- 2026-10-31 (finding, out of scope): `profiles_update` is `auth.uid() = id` with no column restriction, so any user may be able to update their own `points`, `is_admin` and similar via PostgREST. Needs its own review.

## Deploy note: ADMIN_API_SECRET and the marketplace sweep (2026-10-31)

What the sweep is: `POST /api/marketplace/sweep`, run on a schedule by `backend/scripts/run_marketplace_sweep.py` (a Railway cron service, same pattern as `run_events_expiry.py` and `run_decay.py`). It auto-releases payment to the cleaner after the review period, expires flexible jobs and frees their holds. The repo holds no schedule; it lives in Railway.

What changed: the route used to be open. It now uses `require_service`, which needs the `X-Admin-API-Secret` header to match `ADMIN_API_SECRET` (constant-time compare, returns 503 if the API has no secret set).

What this means when we push:
1. The API service (Railway) must have `ADMIN_API_SECRET` set. It already does for `admin_prod` routes.
2. The sweep cron service must have the SAME `ADMIN_API_SECRET` plus `API_URL` (the public API base URL). If either is missing the script gets 403/503 and nothing is released. Now an alert fires: if the sweep has not run for 45 minutes, admins get a `payments_admin_alert` notification (once per 6 hours). It needs migration 130 (`service_heartbeats`) applied in prod.
3. Deploy order: set the cron env vars BEFORE or WITH the API deploy. Otherwise the first scheduled run after deploy fails and jobs wait one more interval.
4. Check after deploy: trigger the cron once manually in Railway, confirm a 200 in its log.
5. Rotating the secret later means changing it on the API, Vercel (still used by `admin_prod` proxies) and the cron service together.
6. Stale-sweep alert (built): each sweep run records a heartbeat; `GET /api/marketplace/jobs` checks it and alerts admins if it is over 45 minutes old. Migration 130 seeds the row, so a missing cron is flagged about 45 minutes after deploy.
