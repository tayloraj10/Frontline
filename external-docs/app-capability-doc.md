# Frontline — App Capability Doc

Living inventory of what the app actually does today, split by user perspective. This is a **tracking doc**, not a design spec — update it whenever a feature is added, changed, or removed. Source of truth is the code; when this doc and the code disagree, the code wins (fix the doc).

Companion: a human-facing version of this doc (for onboarding/stakeholders, not engineers) lives at `app-capability-doc-external.md` (same folder) — regenerate it from this one after edits, don't maintain it independently. A business-partner-only overview (for sending to prospective partners) lives at `frontline-partner-overview.md`.

Status legend: no tag = fully working · **(Beta)** = shipped but flagged as still being tested in prod · *(stub)* = record/UI exists but the effect isn't implemented yet.

Last updated: 2026-08-03.

---

## 1. Regular / Individual User

### Auth & Account
- Sign up via email+password or Google OAuth (`/signup`). Must check a Terms/Privacy agreement box to enable submit; this stamps `profiles.terms_version_accepted` / `privacy_version_accepted` at current version + timestamp via `acceptLegal()`. Falls back to a "check your email" state if email confirmation is required.
- Log in via email+password or Google OAuth (`/login`), with post-login `next` redirect support.
- Forgot-password / reset-password flow (`/forgot-password`, `/auth/reset-password`).
- Edit profile: display name, username, bio, avatar (R2 upload) — `/settings/profile`.
- Account settings (`/settings/account`): change password (re-verifies current password live before allowing the change), change email (blocked for Google OAuth accounts — "managed through Google"), permanently delete account (must type "delete my account" exactly; cascades to profile + contributions).
- View own or any user's public profile at `/users/[username]`.
- View global leaderboard (`/leaderboard`).
- **Legal re-acceptance gate exists but is currently disabled** — `LEGAL_GATE_ENABLED = false` in `LegalGate.tsx`. When on, it blocks existing/OAuth/stale-version users with a full-screen re-accept modal.

### Campaigns & Territory Gameplay
- Browse the campaign map (`/campaigns/[slug]`): territory claims, active campaign events ("hotspots"), stats bar, individual + group leaderboard tabs, live activity feed, personal "Mine" tab.
- Log a contribution: pin placement (GPS or manual), bag counts (small/large) and/or pounds and/or route-based cleanup, optional photo. Campaign type (territory / choropleth / heatmap / collage / hex_bloom) determines the specific stat units and form shown.
- Claim territory for self or for a group they belong to (group selector in the contribution flow). **Territory claiming's map layer (claimed/contested/unclaimed outlines) is opt-in and off by default** — a separate, single-select "Geographic Stats" toggle group (Zip/Postcode, and on `trash-war` also Neighborhood/Borough) shows the same underlying activity metrics (points, bag counts, recent activity, photos) with no ownership/claimed-by/group-battle info, via `GET /api/geo-units/{geo_unit_id}/stats`. Claiming itself still works unchanged when the territory layer is manually toggled on.
- **Route mode (Beta)** — trace an actual walked route on the map as a contribution; distinct from a hosted event's purely decorative planned route.
- Report a trash "problem": pin, severity, optional photo.
- **Claim-a-report challenge**: claim an open report (one active claim per user), submit a GPS-gated "before" photo within a countdown window, then a GPS-gated "after" photo within a second countdown, which auto-resolves the report and rolls straight into normal bag/pound contribution logging with both photos attached. Claims can be released voluntarily or expire back to "open."
- Flag a report as inappropriate/spam; auto-hides after a flag-count threshold.
- Flag/report any other user-submitted photo (contribution map-marker photos, cleanup-event gallery photos, profile avatars) as inappropriate; auto-hides after the same flag-count threshold as problem reports.
- Proximity "Log here" banner appears near an in-window, self-log-mode cleanup event (dismissible per session); suppressed entirely for organizer-total events.
- View nearby partner-business offers and event hotspots plotted on the map.

### Cleanup Events
- Browse a group's events; RSVP Going / Maybe / Can't go (blocked from Going once full).
- Check in via GPS (server-enforced proximity + time window) or a 6-character organizer join code (no GPS needed).
- Self-log an individual contribution at a self-log-mode event.
- View roster (attendee names, checked-in status, logged bags/pounds/points), event photo gallery, add own photos.
- View route/pin, address, "get directions," "show on map."
- At an organizer-total event, no self-log action is offered — the organizer logs the team total.

### Groups
- Browse/search groups (`/groups`) with member and upcoming-event counts.
- **Join or leave any group directly, self-service, no approval needed** (`group_members` insert/delete straight from the client).
- Apply to create a *new* group (`/groups/apply`) — goes into an admin approval queue; approval auto-grants the applicant `admin` role on the new group.
- View a group's public page: members, description, logo, social links, upcoming events, event history **(Beta)**.

### Partners (Businesses)
- Browse partner businesses (`/partners`) and view detail pages (`/partners/[slug]`) — linked campaign, map location, active offers.
- Redeem offers: "spend" mode deducts `points_cost` from `spendable_points`; "threshold" mode just requires reaching cumulative `points_threshold` without spending; `max_redemptions_per_user` enforced. Redemption yields a unique code with tap-to-copy; used redemptions show a crossed-out state once a merchant marks them used.
- Apply to become a partner business (`/partners/apply`) — public form, goes to admin review.

### Legal
- View Terms of Service and Privacy Policy (`/legal/terms`, `/legal/privacy`).

---

## 2. Group Admin (subset of regular users — `group_members.role = 'admin'`)

- Edit group profile: name, description, logo, social links.
- Manage members: promote/demote admins, remove members. Cannot demote/remove the sole remaining admin or self.
- Delete the group (type-to-confirm). Blocked if the group has active/blocking cleanup events — surfaced with links to the specific blocking events.
- Create a cleanup event **(Beta page)** — gated server-side on group-admin role. Configures:
  - Logging mode at creation: `organizer_total` (default — organizer logs one combined total) vs `individual` (each attendee self-logs).
  - Cohost groups (multiple groups jointly hosting one event).
  - Optional decorative planned route (does not credit any zip/geo-unit — separate from the real zip-crediting route-mode contribution).
  - A shareable join code for GPS-free check-in.
- Edit or cancel an existing event (cancel confirms via dialog; cancelled events hide RSVP/check-in).
- Manually add an attendee by searching users and RSVPing them on their behalf.
- Manually check in an attendee (skips their own GPS/code check-in).
- Promote/demote attendees to co-organizer.
- "Log for them" — log an individual attendee's contribution on their behalf (by bag count or weight).
- "Log team total" (organizer-total events only) — enter the whole event's haul once; auto-splits points equally across an eligible pool (checked-in-only or everyone-going), excluding anyone already credited individually. **Re-submitting wipes and re-splits from scratch** (cumulative total each time, not a delta) — explicit warning banner. Supports an advanced per-attendee override table and shows log history (current vs. superseded).

---

## 3. Partner Business User (`partner_business_admins` linkage)

- Self-service dashboard at `/partners/dashboard`.
- Edit business profile: name, description, logo, location (map picker), website/Google Maps links, hours.
- **Campaign linkage is pinned to `trash-war`** for non-site-admin business users — the multi-campaign selector is hidden and their business is force-relinked to `trash-war` regardless of any prior setting, since it's the only campaign currently live on the map. Site admins who are also business admins see the full selector.
- Create/edit/cancel offers — same `OfferRow` component the admin panel uses, so this is functionally identical to admin offer management (title, description, redemption mode/cost/threshold, max redemptions per user, active window).
- Mark a redemption as used (in-person merchant confirmation step).
- `is_business_only` accounts are routed straight to `/partners/dashboard` on login and have the main nav de-emphasized, at two independent gating points (login redirect + header nav).

---

## 4. Site Admin (`profiles.is_admin`)

`AdminPanel.tsx` — six tabs:
- **Users** — management/search.
- **Campaigns** — CRUD, plus the "Spendable points" per-campaign toggle (`counts_toward_spendable_points`) with a dry-run impact preview before committing, and "Recompute all balances" (re-sums `points`/`spendable_points` for every user from current contribution/report/redemption data, previewed before committing, flags any resulting negative balance in red, sends `points_adjusted` notifications to affected users).
- **Campaign Events/Triggers** — documented implemented-vs-stub split (see below).
- **Partner Businesses & Offers** — approve/reject applications (kept as records, not deleted), manage offers via the same `OfferRow` businesses use.
- **Groups** — approval queue (approve grants `group_members` admin row + flips status; reject keeps the record), plus the same delete capability as a group admin (site admin alone can delete pending/rejected applications, which have no `group_members` row yet).
- **Leaderboard / verification** — per-campaign, per-user prize-verification detail view (`admin/leaderboard/[campaignId]/[userId]`).

On the campaign map: an "Admin controls" dialog to create timed campaign events by picking an area directly on the map, toggle an NYC-neighborhoods overlay (trash-war only), and dismiss timed events.

Prod-write paths (`admin_prod.py` — points recompute, spendable-points toggle, cleanup-event wipe, user search) are gated by a shared secret (`ADMIN_API_SECRET`) and are only reachable through the six Next.js proxy routes under `frontend/src/app/api/admin/**`, which **do independently re-verify `is_admin` server-side before forwarding the secret** (confirmed by reading the proxy route source, not just inferred from the backend docstring).

Site admins implicitly inherit every group-admin and business-admin capability above (checks for `is_admin` short-circuit several of those gates, e.g. the business campaign-linkage restriction).

---

## 5. Known gaps / not-yet-built (tracked so this doc stays honest)

- **Event trigger effects** — `threshold_reached` and `report_count` triggers fire and dedupe correctly, but of the five event *types* only `boss_spawn` and admin-created `timed_event` actually apply their effect (`score_multiplier`). `notification`, `cascade_unlock`, and `seasonal_reset` create a `campaign_events` row but do nothing beyond that *(stub)*. `decay_elapsed` and `external_api` trigger conditions aren't implemented at all — nothing sets `territory_claims.decay_starts_at`, so the deployed decay cron is currently a no-op.
- **Campaign `status` enforcement is frontend-only** for `draft`/`paused`/`completed` hiding from listings; there's no backend guard rejecting contributions to a non-`active` campaign beyond what's already wired (see `dev-docs/campaign-app-scope.md` for the up-to-date matrix).
- **Cleanup-event contribution proximity is honor-system** — the 150m gate only exists client-side to show/hide the "count toward event" checkbox; nothing blocks a submission claiming an event link from an arbitrary location. (Check-in itself *is* server-enforced; this gap is specific to the contribution-submit path.)
- **`census_tract` geo unit is selectable in the campaign-create form but has no data loader** — would silently produce a campaign with zero geo units.
- **Recompute of historical `contributions.value`** if bag/pound point constants change is not built — deferred pending a planned "engine-admin-changes" effort to centralize scoring constants (see `dev-docs/dev-backlog-2026-07-24.md` #8 Part B).
- **Business self-service for multiple admins per business** doesn't exist — currently admin-only via `BusinessAdminsManager`.
- **No redemption-history detail for business owners** — dashboard shows only a raw redemption count per offer, not who/when.
- **Legal re-acceptance gate is built but switched off** (`LEGAL_GATE_ENABLED = false`).
- **NYC borough stats outline layer is built and toggleable in code, but non-functional in prod** — `nyc_borough` geo units (5 boroughs, trimmed of small Jamaica Bay / Pelham Bay islets) are only seeded in local dev (via `POST /admin/geo-units/nyc_borough/reload`), not the prod DB, so the Borough toggle (part of the new Geographic Stats group, `trash-war` only) will show an empty layer in prod until that data load happens. Zip/Postcode and Neighborhood stats toggles are unaffected (`nyc_neighborhood` and `zip`/`uk_postcode_district` geo units are already in prod).

---

## Maintenance

Update this doc whenever a feature ships, a gate changes, or a stub gets implemented — treat stale entries here as a bug, same as stale code comments. When updating, regenerate the human-facing companion doc (`app-capability-doc-external.md`) from the new content rather than hand-editing it separately.
