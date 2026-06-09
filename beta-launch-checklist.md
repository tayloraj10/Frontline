# Beta Launch Checklist

Five topics to work through before pushing the app live.

---

## Topic 1: Dev Tasks (Auth, Groups, Trash War)

### Login / Auth
- [x] Google sign-in (frontend button exists — enable OAuth provider in Supabase dashboard, add `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` env vars)
- [x] "Forgot password?" link on login page
- [x] Password reset flow (`/forgot-password` → email → `/auth/callback?next=/auth/reset-password` → set new password)
- [x] Email confirmation on signup — shows "check your email" state when Supabase returns no session
- [x] Auth callback errors shown on login page (`?error=auth_failed`)
- [x] Google OAuth button loading state on both login and signup pages
- [x] Session expiry handling — graceful re-auth prompt instead of silent failure
- [x] Account deletion — self-serve from settings
- [x] Account settings page (email change, password change, danger zone)

### Groups
- [x] Profile picture upload — `logo_url` column exists but never written or displayed; wire presigned R2 upload
- [x] Edit group info page (`/groups/[slug]/edit`) — name, description, website; gate behind `isAdmin`
- [x] Member management — promote to admin, remove members (RLS `group_members` update policy needed)
- [x] RLS `groups_insert` policy — add `is_site_admin()` check at DB layer

### User Profiles
- [x] Profile image upload — presigned R2 upload → `profiles.avatar_url`
- [x] Full profile page (`/users/[username]`) — contribution history, joined groups, stats, bio
- [x] Profile edit page — display name, bio, username (availability check), avatar
- [x] Account settings — email change, password change, danger zone

### Trash War / Events
- [x] Backend campaign status guard — `POST /api/contributions/submit` checks campaign status, returns 403 if not `active`
- [x] Backend trigger evaluation guard — skip `_evaluate_triggers` for non-active campaigns (note: only guarded via `submit` endpoint, not `process`)
- [x] Frontend status banner on campaign page when status is `paused` or `completed` — not needed; only active campaigns surface in the listing
- [x] Boss spawn score multiplier — active `score_multiplier` campaign events are fetched and applied to `effective_value` in `submit_contribution`
- [x] `time_elapsed` condition type — `_check_time_elapsed_trigger` handler implemented in `events.py`
- [ ] Verify end-to-end: trash report → `problem_reports` insert → report count threshold → boss event spawn → map marker

### Solarpunk
- [x] Solar panel aesthetic for Stage 0 hexes (dark fill + internal grid line overlay)
- [x] GSAP bloom wave animation when a hex advances a stage
- [x] Per-hex photo collage panel (thumbnail grid of `solarpunk_photo` submissions)
- [x] Demo data seeder
- [x] Milestone unlock system (cross stage threshold → `campaign_events` record + badge)

### Legal
- [x] Terms of Service page (`/legal/terms`)
- [x] Privacy Policy page (`/legal/privacy`)
- [x] Link both in signup flow (footer or checkbox acknowledgment)

---

## Topic 2: Beta UI

- [x] Beta banner — version pill (`NEXT_PUBLIC_APP_VERSION`) inline in `AppHeader` next to the FRONTLINE wordmark; falls back to "beta" if unset
- [x] App version — `NEXT_PUBLIC_APP_VERSION=0.1.0-beta` in `.env.local`; displayed in header pill
- [x] Support email — `collectiveactionsupport@gmail.com` as a `support` mailto link on the right side of `AppHeader`

---

## Topic 3: External Model Imports

Before going live, import canonical models from the external API (hard launch dependency):

- [ ] **Groups** — canonical group/org schema, membership, roles (current `groups` table is a placeholder)
- [ ] **Cleanups** — full cleanup event model (location, photos, bag counts, organizer, participants)
- [ ] **Trash Reports** — community-submitted trash reports to seed Trash War data

*Need to clarify: is this a runtime API integration, a one-time data migration, or shared TypeScript/Python types installed as a package?*

---

## Topic 4: Deployment

**Frontend:** Vercel (confirmed)

**Backend:** Railway (~$5/mo always-on) vs. GCP Cloud Run (min-0, cold start)

- The MVT tile endpoint (`GET /api/tiles/{campaign_id}/{z}/{x}/{y}.mvt`) is in the user-facing critical path — cold starts would cause blank maps on first load. **Railway recommended for beta.**
- [ ] Confirm Railway vs. Cloud Run decision
- [ ] Set up Railway project, connect git repo, configure env vars
- [ ] Set up Vercel project, configure `NEXT_PUBLIC_*` env vars
- [ ] Configure CORS on FastAPI for Vercel production domain
- [ ] Set up territory decay cron (Railway cron or Cloud Run Scheduler — `POST /decay/run` endpoint exists)

**Future optimization:** Pre-generate static MVT tiles at seed time → upload to R2 → serve from CDN. Eliminates backend from tile path entirely for campaigns with fixed geometry.

---

## Topic 5: Prod / Dev Database

**Recommended approach for beta:** Local Supabase for dev, one cloud project for prod.

```bash
npx supabase start  # full local stack: Postgres + Auth + Realtime + PostgREST
```

- `.env.local` → `http://localhost:54321` (local)
- Production env → cloud Supabase project URL

- [ ] Confirm local Supabase dev workflow is set up and working
- [ ] Document env var setup in README or a `docs/local-dev.md` file
- [ ] When ready to upgrade: Supabase Pro ($25/mo) unlocks database branching per git branch

*Avoid schema isolation (e.g., `public` vs `dev` schema in one project) — breaks Supabase Auth/RLS assumptions.*
