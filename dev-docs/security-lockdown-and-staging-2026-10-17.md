# Backend security lockdown and staging environment (2026-10-17)

Status: **scoped, not started**. Nothing below is implemented.

Supersedes the staging section of `staging-environment-scoping-2026-08-10.md` (that doc is still the source for the "why not a schema split" reasoning). Related: `master-backlog.md` (items "Lock down FastAPI/Railway backend auth" and "`admin.py` has no auth/permission checks").

Current stack: Supabase Pro, Railway Hobby, Vercel free (Hobby).

## 1. Where we are today

- The FastAPI backend (`backend/app/api/routes/*.py`, about 190 route handlers) has **no auth layer**. There is no JWT verification anywhere except one hand-rolled check in `device_tokens.py` (calls Supabase `/auth/v1/user` on every request).
- Identity is whatever the client says. About 150 places take `user_id`, `requesting_user_id`, `created_by` or `organizer_id` from the path, query or body and trust it.
- `admin_roles.py` is mounted in prod and trusts `requesting_user_id`, so anyone who knows a site admin's UUID can read or set roles, including granting themselves admin.
- `admin.py` (seed, wipe, recompute) is protected only by `if not settings.is_production` in `main.py`. A staging environment with `ENVIRONMENT != production` would mount it wide open on a public URL (see section 4).
- `admin_prod.py` is protected by the shared `X-Admin-Api-Secret`, called only from Next route handlers that first verify the admin. This pattern is fine and stays.
- The Railway crons call HTTP endpoints with no credentials: `POST /api/events/expire`, `/api/cleanup-events/organizer-reminders/run`, `/api/cleanup-events/organizer-followups/run`, and (per its docstring) `/api/decay/run`. Those endpoints are therefore public.
- The frontend sends a bearer token in exactly one place (`lib/pushNotifications.ts`). About 58 frontend files call the API with no auth.
- UUIDs are not secret: they appear in profile URLs, leaderboards and API responses.

## 2. Goals and non-goals

Goals:
1. Nobody can act as, delete, or escalate privileges for another user.
2. Operational endpoints (crons, seed, wipe, recompute, presign) are not callable by the public.
3. Ship in small, separately reversible stages. Prod is live; no big-bang deploy.

Non-goals (for now):
- Auth on public read endpoints (tiles, geo-units, leaderboards, public profiles, campaign pages).
- Rate limiting, WAF, per-IP throttling (listed as a final-stage nice-to-have).
- Moving the frontend off direct Supabase calls (RLS stays the gate for those).

## 3. Design

### 3.1 Backend primitives (new `app/core/auth.py`)

- `get_current_user` dependency: reads `Authorization: Bearer <supabase access token>`, verifies it **locally**, returns `AuthUser(id, email, ...)`. Raises 401 if missing or invalid.
  - Verify locally with PyJWT, not a network call per request (the `device_tokens.py` approach adds a Supabase round trip to every request). First check which signing mode the Supabase project uses (Project Settings, JWT Keys). If asymmetric (JWKS), verify against the project JWKS URL and cache the keys. If legacy HS256, verify with the JWT secret as a new Railway env var.
  - Check `aud == "authenticated"`, `exp`, and issuer.
- `get_optional_user`: same, returns `None` instead of 401. For endpoints that behave differently when logged in but stay public.
- `require_site_admin`: `get_current_user` plus the existing `is_site_admin()` from `app/services/admin_roles.py`.
- `require_cron_secret`: checks an `X-Cron-Secret` header against a new `CRON_SECRET` env var. Used by the cron-invoked endpoints. The 4 `backend/scripts/run_*.py` scripts add the header.
- Ownership helpers (group admin, event organizer, business admin, team event organizer), built from the checks that already exist inline in the routes. One helper per concept so the check is not re-implemented per route.
- Rule for converting a route: **delete the client-supplied identity param, use `user.id` from the token.** Where a route legitimately acts on another user (organizer logging for an attendee), keep the target id but add a permission check on the caller.

### 3.2 Rollout switch

One env var, `AUTH_ENFORCEMENT`, with three values:
- `off`: dependencies are no-ops (current behavior).
- `log`: dependencies verify and **log** failures (route, reason, whether a token was present) but let the request through.
- `enforce`: failures return 401/403.

Each converted route uses the dependencies; the env var is flipped per environment on Railway. Rollback is an env var change, not a redeploy. Critical routes (stage 2) skip `log` and go straight to `enforce` once the frontend is confirmed sending tokens, since leaving them open is the thing we are fixing.

### 3.3 Frontend

- One shared API client (`frontend/src/lib/api.ts`) that wraps `fetch`, reads the Supabase session, and attaches `Authorization`. Replace the ~58 call sites to use it. Mechanical, and reviewable per directory.
- Three call contexts need to be handled explicitly:
  - Client components: `supabase.auth.getSession()` from the browser client.
  - Server components and Next route handlers: read the session from the server Supabase client (cookies) and forward the access token.
  - Capacitor app: loads the remote Vercel URL, so it gets frontend changes on deploy. Token source is the same browser client. No store release is needed for this work.
- Token expiry: the wrapper should refresh via `getSession()` (which refreshes automatically) and retry once on 401.
- Existing admin flow (Next route handler verifies admin, then calls `/admin-prod/*` with the shared secret) stays as is.

### 3.4 Mobile and cache skew

Deploys to Vercel and Railway are not atomic, and users can hold a cached old bundle. This is why stage 1 ships the frontend first and uses `log` mode: stragglers show up in logs instead of as outages. Only enforce a route after the log shows no legitimate unauthenticated traffic for several days.

## 4. Staging environment (prerequisite for testing this safely)

Why it is needed here specifically: JWT verification depends on the real Supabase project's signing keys, and `AUTH_ENFORCEMENT` flips and cron-secret wiring need a deployed environment to rehearse on. Local `supabase start` covers logic, not the deployed wiring.

### 4.1 Architecture

| Layer | Prod | Staging |
|---|---|---|
| DB / auth | Supabase Pro project (`nvidlxyzyoxzalxbydvg`) | New, separate Supabase project. Same migration files, applied independently. Never a schema inside the prod project (see old doc). |
| Backend | Railway service `Frontline`, deploys from `master` | New Railway environment `staging` in the same project, deploys from `staging` branch, own env vars. |
| Frontend | Vercel production, from `master` | Vercel branch deployment for `staging` branch with Preview-scoped env vars, plus a domain such as `staging.frontlinemaps.com` assigned to that branch. |
| Storage | R2 bucket `frontline-uploads` | Separate R2 bucket (cheap, avoids test photos mixed with real ones). |
| Crons | 4 Railway cron services | Skipped at first. Add one cron (events expiry) later to rehearse `X-Cron-Secret`. |
| Stripe | Live keys | Test keys only. |
| Auth providers | Google and Apple on prod domain | Add staging redirect URIs to Google OAuth client (decision below). Apple and native sign-in are not exercised on staging. |

### 4.2 Cost and plan constraints (verify each in the dashboards before committing)

- **Supabase Pro:** a second project in a paid org is billed for its own compute (Micro is roughly $10 per month; Pro includes a compute credit that usually covers one project, so the net is about one extra Micro). Alternative: put staging in a separate free-tier org (no cost, but it pauses after a week of inactivity and has a 500 MB cap; PostGIS is available). Supabase Branching is a third option but ties staging to preview branches with per-hour billing and needs the GitHub integration; not recommended since we want a long-lived, stable staging DB.
- **Railway Hobby:** environments in one project are supported. Cost is usage based on top of the $5 plan credit; one idle small service should be low single-digit dollars. Remember `.railway/railway.ts` currently declares only prod; either extend it with a staging environment or configure staging by hand and note it here (decide in 4.4).
- **Vercel free (Hobby):** branch-specific env vars and branch domains work. Preview deployments are **publicly reachable** (deployment protection is limited on Hobby), so staging is a public URL. Mitigate: `noindex`, no real data, and the admin router must not be open (see 4.3). Also note Hobby is for non-commercial use under Vercel's terms; the app takes payments, so plan to move to Pro when payments v2 launches regardless of staging.
- Check Vercel builds: confirm backend-only pushes to `staging` do not trigger pointless frontend builds (also an open item in the todo for master).

### 4.3 Staging-specific hazards

- **`admin.py` is gated only by `is_production`.** A staging backend with `ENVIRONMENT=staging` would expose seed, wipe and recompute without auth on a public URL. Resolve one of: (a) do stage 2 `admin.py` conversion first (`require_site_admin` on every route in the router), then mount it everywhere; or (b) in staging, mount `admin.py` only when an explicit `ENABLE_ADMIN_ROUTER` var is set, and protect it with the `X-Admin-Api-Secret` check until (a) lands. Do (b) first, then (a) as part of stage 2.
- Verify that existing Vercel PR preview deployments do not point at prod Supabase (carried over from the old doc). If they do, that is its own prod-safety gap to close before anything else.
- Staging secrets must all differ from prod: service-role key, JWT secret or keys, `ADMIN_API_SECRET`, `CRON_SECRET`, R2 credentials, Stripe keys, FCM credentials (or leave push disabled).
- Push notifications on staging: leave disabled. Do not apply the push Vault-secret setup to the staging DB until needed.

### 4.4 Setup steps

1. Create the staging Supabase project; apply all migrations (`supabase db push --project-ref <staging-ref>`, run by the user, never against prod by Claude). Confirm schema parity with prod.
2. Create the `staging` git branch from `master`.
3. Railway: create the `staging` environment, deploy from `staging` branch, set env vars (staging DB URL, service-role key, `SUPABASE_URL`, `CORS_ORIGINS`, `ENVIRONMENT=staging`, `ADMIN_API_SECRET`, `CRON_SECRET`, `AUTH_ENFORCEMENT`, R2 vars).
4. Vercel: add Preview-scoped env vars for the `staging` branch (staging Supabase URL and anon key, staging backend URL, `ADMIN_API_SECRET`); assign the staging subdomain to the branch.
5. Supabase auth settings on staging: site URL and redirect allow-list for the staging domain; enable Google with a client that lists the staging redirect URI.
6. Seed through the Seeder registry (`POST /admin/seed`), per the project seeding rule. No copying of prod data.
7. Smoke test: sign up, log a contribution, create a group and event, admin pages.
8. Cutover: keep merging PRs to `master` until staging has proven itself on stage 1 of the lockdown, then switch to PR to `staging`, then `staging` to `master`.

### 4.5 Open decisions

- Staging Supabase: second project in the Pro org (about $10 per month) or a free separate org (free, pauses)? Recommendation: second project in the Pro org, since a paused DB defeats the purpose of a staging check.
- Google OAuth: reuse the existing client (add redirect URI) or a new client for staging? Check the Android Credential Manager issue first (see `project_quantum_signing_broke_google_signin` memory) before touching the shared client. A separate client is safer.
- Manage the Railway staging environment through `.railway/railway.ts` or by hand?
- Do we want one staging cron to rehearse `X-Cron-Secret`? (Recommendation: yes, events expiry only, in stage 2.)

## 5. Staged plan

Each stage is one or more PRs. Every stage: PR, deploy to staging, verify, merge to `master`, deploy, watch logs. Routes are listed by module; "verify" marks routes whose role I could not confirm from the decorator alone and should be read before converting.

### Stage 0: Foundations (no behavior change)

- Stand up staging (section 4), at least steps 1 to 4, with `admin.py` handled per 4.3(b).
- Confirm Supabase JWT signing mode and add the needed env vars.
- Check the Vercel preview env var audit.
- Write `app/core/auth.py` (3.1) with tests that run locally against `supabase start` tokens.
- Add `AUTH_ENFORCEMENT` and the `log` behavior.

### Stage 1: Frontend sends tokens (still no enforcement)

- Build `lib/api.ts` and migrate all call sites (client, server components, route handlers).
- Deploy backend with dependencies attached to **zero** routes except a test route; deploy frontend.
- Exit criteria: in `log` mode on a sample of routes, the share of requests with a valid token matches logged-in traffic; no unexplained missing-token requests from real users for a week.

### Stage 2: Critical (enforce immediately after stage 1)

Ordered by blast radius. These are the ones where an anonymous caller does serious damage.

| Area | Routes | Fix |
|---|---|---|
| Privilege escalation | `admin_roles.py`: GET `/admin/roles/{user_id}`, POST `/admin/roles`, DELETE `/admin/roles/{user_id}/{role}` | `require_site_admin` (self-read allowed for GET). Drop `requesting_user_id`. |
| Account takeover/destruction | `account.py`: DELETE `/account/{user_id}`, GET `/account/{user_id}/export` | Caller must equal `{user_id}` (or site admin). |
| Cron endpoints | `events.py` POST `/events/expire`, POST `/events/check-triggers/{campaign_id}`; `cleanup_events.py` POST `/organizer-reminders/run`, `/organizer-followups/run`; `decay.py` POST `/decay/run` | `require_cron_secret`; update the 4 scripts to send `X-Cron-Secret`; set `CRON_SECRET` on Railway for the API and all cron services. Deploy order: API accepts both (secret optional) first, then scripts send it, then require it. Verify whether `run_decay.py` goes through HTTP or direct SQL. |
| Dev/ops router | all of `admin.py` | `require_site_admin`, so the `is_production` exclusion becomes defense in depth rather than the only gate. |
| Money and rewards | `partners.py`: POST `/offers/{offer_id}/redeem`, POST `/redemptions/{id}/mark-used`, business admin add/update/remove, offer-event attach/detach | Caller identity from token; business-admin permission check for the management and mark-used routes. |
| Storage abuse | `upload.py` GET `/upload/presign` | `get_current_user` (stops anonymous R2 uploads). |

### Stage 3: Destructive

Routes that delete or remove access. Require authenticated caller plus ownership or role.

- `contributions.py`: DELETE `/contributions/{id}` (owner or admin)
- `groups.py`: DELETE `/groups/{group_id}` (group owner or site admin)
- `problem_reports.py`: DELETE `/{report_id}` (reporter or admin), DELETE `/{report_id}/flag`, POST `/{report_id}/claim/release`
- `cleanup_events.py`: DELETE `/{id}/organizers/{user_id}` (event organizer)
- `team_events.py`: DELETE `/{id}/leave` (self), DELETE `/{id}/organizers/{user_id}`, DELETE `/{id}/submissions/{contribution_id}`
- `partners.py`: any remaining DELETE routes not covered in stage 2

### Stage 4: Writes

Anything that creates or changes data as a user. Convert to token identity; add permission checks where a role is implied.

- `contributions.py`: POST `/submit`, POST `/process` (verify), plus `/first-action-bonus-eligibility` and similar per-user reads that take a `user_id`
- `cleanup_events.py`: create, PATCH, rsvp, photos, check-in, organizer-check-in, log-for-attendee, log-team-total, add organizer, attendee-reminder preview/send
- `team_events.py`: create, PATCH, teams create/patch, join, check-area-route (verify), submission PATCH
- `problem_reports.py`: create, claim, before-photo, after-photo, flag
- `content_flags.py`: POST create
- `events.py`: POST bonus-spot (verify who may call it)
- `device_tokens.py`: swap the hand-rolled check for `get_current_user` (and drop `user_id` from the body)
- `partners.py`: notify-attachment

### Stage 5: Private reads

Public data stays public. Convert reads that expose private or role-scoped data:

- `account.py` export (done in stage 2), `users.py` `/me/has-pending-organizer-items`, `/users/search` (decide: logged-in only)
- `partners.py`: `/offers/{id}/redemptions/me`, business admins list, business `radius-*`, `tier-activity`, `redemptions` (business admin)
- `groups.py`: organizer dashboard, `stats/export.csv|xlsx`, `stats/members/{user_id}/activity` (group admin)
- `team_events.py`: `admin-summary`, all `export*` routes, `participant-detail`, `submissions` (organizer)
- `campaign_dashboard.py`: all (verify who the intended audience is, likely campaign/site admins), including `export.pdf`
- `problem_reports.py`: `pending-challenge-completion`, `flag-status`
- `leaderboard.py` per-user contributions range (verify whether it should be public)

Left public on purpose (confirm each as we go): `/health`, `/tiles/*`, `/geo-units/*`, leaderboards and geo-stats, `contributions` map reads (`hex-bloom`, `locations`, `data-bbox`, `geo-unit-at`, `hex/.../photos`, `nearby-hotspot`, `points-basis-options`), `events` map-context/centroids/active-multiplier/bonus-spots, public team event and group stats, `partners/radius-tiers`, `cleanup-events` public list/detail and `nearby-reports`.

### Stage 6: Cleanup and hardening

- Remove dead `user_id` / `requesting_user_id` params and the `log` mode once everything is `enforce`.
- Tighten CORS (`allow_methods`, `allow_headers`) to what is needed.
- Basic rate limiting on write and presign routes.
- Update `app-capability-doc.md` and `master-backlog.md`; mark both backlog items done.
- Add auth tests to CI-style local checks: for every non-public route, an unauthenticated call returns 401 (a route-table sweep test that fails when a new route is added without a dependency or an explicit public allow-list entry).

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Frontend and backend deploy out of step, or cached bundles | Stage 1 ships tokens first; `log` mode; per-route enforce; env-var rollback |
| Token refresh edge cases (expired token mid-session) | Wrapper refreshes and retries once; test on staging with a short JWT expiry |
| SSR / route handlers forgetting to forward the token | Single wrapper, grep for raw `fetch(` to the API base in review |
| Cron breaks silently after secret enforcement | Dual-accept window, then a manual cron trigger on prod before turning enforcement on, watch Sentry |
| Legit cross-user actions blocked (organizer logging for attendees, admins viewing members) | Explicit permission helpers, reviewed per route; staging walkthrough per role |
| Staging exposes admin router publicly | 4.3 (b) before the first staging deploy |
| Prod migrations | Not part of this work; none of the stages require schema changes. Any that appear are applied by the user, not Claude |

## 7. Suggested order of work

1. Stage 0 (staging plus auth module) is one block of work; staging setup and the auth module can proceed in parallel.
2. Stage 1.
3. Stage 2 as soon as stage 1 is confirmed clean. This is where the real risk reduction lands.
4. Stages 3 to 5 incrementally, one module per PR, whenever those files are touched anyway.
5. Stage 6 last.
