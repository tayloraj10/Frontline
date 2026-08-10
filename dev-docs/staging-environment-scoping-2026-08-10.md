# Staging environment scoping (2026-08-10)

Status: **scoped, not started**. Nothing below has been implemented.

## Goal

A staging environment that lets us QA changes against a real deployed stack (not just local `supabase start`) before they reach prod users, without risking prod data or prod infra costs/quota.

## Why not another schema split

We already tried "one DB, two schemas" (`dev`/`public` in the same Supabase project) for local-vs-prod separation and it caused real problems: unqualified-table search-path bugs (writes landing in one schema, reads silently falling back to the other), and duplicate notification-trigger fires when copying data between schemas. See `project_schema_split_todo` memory / `supabase/migrations/023_drop_dev_schema.sql`. Staging should be a **fully separate Supabase project**, not a schema inside the prod project.

## Proposed architecture

| Layer | Prod (today) | Staging (proposed) |
|---|---|---|
| DB | Supabase project `nvidlxyzyoxzalxbydvg` | New, separate Supabase project — own URL, own service-role key. Same migration files applied independently via `supabase db push --project-ref <staging-ref>`. |
| Frontend | Vercel, deploys from `master` | Same Vercel project, Preview environment scoped to a `staging` branch, own env vars (staging Supabase URL/anon key, staging backend URL), custom domain e.g. `staging.frontlinemaps.com`. |
| Backend | Railway service, deploys from `master` | New Railway environment in the same project, deploys from `staging` branch, own `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `CORS_ORIGINS`. |
| Storage | R2 bucket `frontline-uploads` | Separate R2 bucket (or a `staging/` key prefix) so test uploads never mix with real user photos. |
| Cron jobs (decay, events-expiry) | Railway cron services (`railway.decay-cron.toml`, `railway.events-expiry-cron.toml`) | **Skip for now** (decided 2026-08-10) — add later only if we need to specifically test decay/expiry timing. Fewer moving pieces, lower Railway cost. |
| Auth | Google OAuth on prod domain | Add staging domain as an authorized redirect URI (same or separate OAuth client — TBD when implemented). |

## Git/deploy workflow (decided 2026-08-10)

**Dedicated `staging` branch.** PRs merge to `staging` first for QA, then `staging` → `master` merges promote to prod. This is a change from the current flow where PRs target `master` directly — needs a decision later on exactly when to cut over (probably: build staging infra first, keep merging to `master` as normal until staging is proven out, then switch the default PR target branch).

## Open items / not yet decided

- Whether the staging Supabase project needs a paid tier (PostGIS + Realtime usage) or fits in Supabase's free tier.
- Whether Google OAuth staging redirect goes on the existing OAuth client or a new one (existing client already had a Credential Manager issue on Android — see `project_quantum_signing_broke_google_signin` memory — worth checking that fix isn't domain-specific before reusing the client).
- Whether to seed staging via the existing Seeder registry (`POST /admin/seed`, per `feedback_seeding` memory) as the standard way to populate test data, rather than copying real prod data.
- Migration workflow mechanics: need a documented two-project push process (apply to staging, verify, then apply the same file to prod) so migrations never drift between the two.
- Current Vercel PR preview deployments' env vars haven't been audited — worth confirming they don't currently point at prod Supabase before staging exists, since that'd be a separate prod-safety gap.

## Rough sequencing (for whenever this gets picked up)

1. Create the new Supabase project, apply all existing migrations to it, confirm schema matches prod.
2. Create the `staging` Railway environment + env vars, deploy backend from a `staging` branch.
3. Add `staging` branch env vars to the Vercel project, verify preview deploy against staging backend/DB.
4. Point a staging subdomain at the Vercel branch deployment.
5. Seed staging data via the Seeder registry.
6. Decide cutover point for making `staging` the default PR target branch instead of `master`.
