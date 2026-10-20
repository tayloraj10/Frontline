# Branch Tracker

Tracks in-progress/stale branches, their status, and what's sitting on them. Update as branches merge or status changes.

**Migration numbering:** master is currently at `108_organizer_dashboard.sql` (099, 103-108 all merged and applied to prod — see merged sections below). `money-and-payments` still claims 100-102, reserved before those numbers were skipped over by later merges; it will need to renumber to 109+ as part of its master-merge step per the strategy below. Any *new* branch cut from master should start its own migrations at **109**.

**Merge strategy for diverging branches:** commit all work on the branch first, then merge `master` into the branch (not the other way around) and resolve any conflicts there, re-testing locally, especially migrations. Only merge the branch into `master` once it's clean on top of latest master. This keeps conflict resolution scoped to the branch, where it can be tested, instead of happening on master after the fact. Don't rebase these branches, since history isn't shared, but merge-in is simpler and avoids any force-push risk. When two branches both claim migration numbers, whichever merges into master first keeps its numbers; the other branch renumbers its migrations to the next free slot as part of its master-merge step.

## ttf-partner-logo
- **Status:** Code complete, styling not finalized
- **Description:** Adds partner logo support for TTF (trash-to-fabulous?) partners. Functionality works but styling isn't at a satisfactory state yet.
- **Migrations:** none
- **Next step:** Revisit styling/design before merge.

## money-and-payments
- **Status:** Active (2026-10-15). Master merged in, UI restyled to the new design, payments v2 in progress. Uncommitted work, admin-only behind the `payments_admin_preview` toggle.
- **Description:** Payments v2: Frontline Plus, sponsorships, Impact page, and sponsored cleanups (site claim flow plus group areas). See `payments-v2-scoping-2026-10-15.md`.
- **Migrations:** `109`-`113` (renumbered payments), `114` (preview toggle), `115_sponsored_cleanups.sql`, `116_cleanup_sponsorship_link.sql`, `118_plus_earning_cap_multiplier.sql`, `117_sponsored_area_geometry.sql`, `119_plus_funding_perks.sql` (early access window, group cap, open-to-sponsors, direct group allocations). None applied to prod.
- **Done:** toggle, restyle, /impact page, sponsored-site claim flow (backend, claim UI, admin review queue, funding hub modes, group-area picker in both event forms, event-to-pool link, group allocation queued on team-total log). Plus redesign, one-time donation card, Plus pill on leaderboards and attendee lists (`PlusFlair`, `is_plus` in queries), `create_free_user` on the mock seeder.
- **Entry points:** "Sponsored cleanups" and "Impact" cards on the Partners (Rewards) page, shown only when payments are visible (no new nav tabs). Mock seeder: `POST /admin/seed/payments-mock` (`PaymentsMockSeeder`). Map: opt-in "Sponsored areas" layer (`useSponsoredMapLayer.ts`, `GET /sponsorships/map`, proxy path `map`). Test checklist: `payments-v2-test-plan-2026-10-15.md`.
- **Limitation:** only organizer-total logging queues group allocations; individual-logging events do not.
- **Next step:** live-test with Stripe test keys (needs test secret key, webhook secret, $5 Price ID), then apply migrations 109-119 to prod when the user is ready.

## bag-logging-types (merged)
- **Status:** Merged to master via PR #103, migration 099 applied to prod. Done.
- **Description:** Adds new bag size/logging categories.
- **Migrations:** `099_granular_bag_tracking.sql`

## adult-businesses (merged)
- **Status:** Merged to master via PR #100, migration 106 applied to prod. Done.
- **Description:** Adds an "adults only / 21+" flag to partner businesses, settable from all add/edit flows (admin panel, public apply, partner dashboard self-edit), with a badge/warning shown everywhere partner info displays (partner directory list/detail, campaign map popups, nearby-partners panel). Also includes unrelated manage-business UX cleanup (unsaved-changes glow + sticky top save bar + collapsible locations section on the edit form) and a map-picker initial-zoom fix (12 → 15) for editing existing locations.
- **Migrations:** `106_partner_business_adults_only.sql`

## partner-apply-account-required (merged)
- **Status:** Merged to master via PR #99, migrations 103-105 applied to prod. Done.
- **Description:** Requires a business submitting via `/partners/apply` to be signed in, records `created_by`, auto-grants business-admin access on approval, auto-flags brand-new signups from this flow as `is_business_only`, and shows a submitter their still-pending business on the Partner Dashboard. Admin review UI simplified too: no offer creation from the admin panel (offers are managed from the business's own Partner Dashboard), no "Edit" click required to review a pending business, and campaign selection defaults to Trash War.
- **Migrations:** `103_partner_business_created_by.sql`, `104_partner_business_own_pending_select.sql`, `105_pending_business_creator_manage.sql`
- **Note:** the actual git branch for this was named `business-submission-rework` (PR #99) — this doc section's heading predates that rename and was never corrected.

## group-event-route-tracking (merged)
- **Status:** Merged to master via PR #98. Done.
- **Description:** Adds route tracking to cleanup events: a "Track my route" launcher on the event page (`GroupEventTrackRoute.tsx`) that records a GPS route + photos for the event (decorative for `organizer_total` group events, recorded with value 0), a dedicated event routes map/list view (`EventRoutesMap`/`EventRoutesSection`, `/cleanup-events/[id]/routes`), R2 photo upload support (`uploadToR2.ts`), and related `ContributionPanel`/`TrackRouteScreen` changes to share the tracking flow.
- **Migrations:** none

## group-and-admin-pulse-checks (merged)
- **Status:** Merged to master via PR #101 and #102. Done.
- **Description:** Adds a group organizer dashboard (`/groups/[slug]/organizer`) with an activity snapshot (`ActivitySnapshotModal`), backend organizer-dashboard service and follow-up notification cron (`run_organizer_followups.py`), plus related admin/notification endpoint additions. PR #102 was a follow-up adjusting header/notification button sizing and layout for consistency.
- **Migrations:** `108_organizer_dashboard.sql`
