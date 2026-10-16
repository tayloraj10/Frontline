# Payments v2 Test Plan and Follow-ups (2026-10-15)

Branch: `money-and-payments`. Everything is admin-only behind `payments_admin_preview` (default on) and `payments_enabled` (off). Nothing here is live in prod.

## 1. Pages and surfaces to test

How to reach them: two cards ("Sponsored cleanups" and "Impact") sit at the top of the Partners (Rewards) page for anyone who passes `paymentsVisible`. There are no new nav tabs. Nothing shows for regular users while `payments_enabled` is off.

| Surface | Route / location | What to check |
|---|---|---|
| Sponsorships hub | `/sponsorships` | Fund a site cleanup ("Use my location"), a group area, a geo unit, a business, or the mission. Payout rule picker (flat, per bag with max, equal split for group areas), per-person cap, status filter, "All sponsorships" list (admin only) |
| Sponsored sites | `/sponsorships` (top section) | Open site shows "Claim this site", claim needs location, before photo, after photo, per-bag input, "Back out", deadlines |
| Allocation review | `/sponsorships` (admin only) | Pending, approve, reject with reason, mark paid out, status filter, pool "left" amount |
| Impact page | `/impact` | Totals render, empty state, mobile layout |
| Frontline Plus (user) | Profile `/users/[username]` | Plus card (not subscribed: pitch, perks, one Get Plus button; subscribed: member since, renewal date, Manage subscription), gold name, avatar ring, Plus badge, monthly recap card with Share (locked teaser for non-Plus) |
| Frontline Plus (group) | `/groups/[slug]` and `/groups/[slug]/stats` | Group Plus card, gold name, avatar ring and Plus badge on the group page, Plus pill on the /groups list (the premium insights card was removed 2026-10-15) |
| Sponsorship widget | `/cleanup-events/[id]` and `/groups/[slug]` | Fund-this-event/group entry point |
| Sponsored area picker | Host Event form AND the ContributionPanel create modal | Appears only when a funded group area exists, create mode only, event outside the area is rejected, one pool link per event |
| Group allocation | After logging a team total on a linked event | A `pending_review` allocation for the host group appears in review; re-logging refreshes a pending one; approved or paid ones are untouched |
| Billing pages | `/billing/success`, `/billing/cancel` | Restyled, links back |
| Admin toggles | Admin panel, Payments settings | `payments_enabled`, `payments_admin_preview`, plus the new sponsored-cleanup settings (default caps, claim deadlines) |
| Hidden state | Toggle `payments_admin_preview` off | Every surface above disappears for admins too, Partners page cards included |

Known limitation: individual-logging events do not create group allocations, only organizer-total events do.

## 2. Mock Frontline Plus for individuals and groups (BUILT)

Built as `PaymentsMockSeeder`, called through `POST /admin/seed/payments-mock?username=<user>&group_slug=<slug>&site_lat=<lat>&site_lon=<lon>&geo_unit_id=<uuid>` (all params optional; `remove=true` deletes every mock row). One user and one group get Plus, plus a funded mock site and group-area pool. Not yet run locally.

Goal: see locked vs unlocked premium UI without going through Stripe.

Plan: add a `PaymentsMockSeeder` to the Seeder registry (run via `POST /admin/seed`, never a standalone script):
- Params: `user_ids`, `group_ids`, `remove` (bool).
- Inserts `subscriptions` rows with `status = 'active'`, `stripe_subscription_id = 'mock_<uuid>'`, `stripe_customer_id = 'mock'`, `stripe_price_id = 'mock'`, far-future `current_period_end`. Idempotent on `stripe_subscription_id`. `remove` deletes only rows whose id starts with `mock_`.
- `has_premium` already reads `subscriptions`, so the Plus flair and insight cards unlock with no code changes.
- Also seed a few funded sponsorships (site, group area, geo unit) with `mock_` Stripe ids so the claim, review and picker flows can be tested before Stripe keys exist.
- Note: the billing portal button will not work for mock rows (no real Stripe customer). Expected.

## 3. Showing sponsored areas on the map (BUILT, untested in a browser)

Built: `GET /sponsorships/map`, proxy path `map`, and `components/map/useSponsoredMapLayer.ts` wired into `CampaignMap.tsx`. A "Sponsored areas" toggle appears in the Layers menu only for viewers who pass `paymentsVisible`, on by default and included in All on / All off. Sites are dollar-badge markers (grey when someone holds a claim) with a popup and a "Claim this site" link; group areas are dashed outlines whose popup says to pick the area when hosting. Still open from the plan: the bottom-sheet popup on mobile, a "host here" deep link that preselects the area, and the discovery extras.

Original plan:

Goal: people and groups discover funded areas and sites while browsing the map.

Plan:
1. **Data**: new read endpoint `GET /sponsorships/map` returning funded, non-exhausted sponsorships as GeoJSON: site sponsorships as points (with radius), group areas as the geo_unit polygon. Fields: id, kind, label, payout summary, remaining cents, claimed flag. Respect `paymentsVisible`; the Next proxy must refuse otherwise.
2. **Layer**: a new "Sponsored" toggle in the campaign map layer controls (on by default, part of All on / All off). Site points get a distinct marker with a dollar badge; area polygons get a dashed outline and light fill.
3. **Popup**: tap a marker or area for a card with label, payout rule, money left, and a CTA: "Claim this site" (deep link to `/sponsorships`) or "Host an event here" (opens the create flow with the sponsored area preselected).
4. **Discovery extras (optional later)**: a "Sponsored near you" chip on the map, a badge on group pages when their area has a pool, and a notification when a pool is funded in a followed area.
5. **Performance**: fetch once per map load, no per-move queries (MapTiler usage is already a cost concern, see `maptiler-usage-reduction-scoping-2026-08-28.md`).
6. **Mobile first**: marker tap targets at least 44px, popup as a bottom sheet on mobile.

## 3b. Defining sites and areas (BUILT, untested in a browser, migration 117)

Funding hub (`/sponsorships`):
- **Site**: name, tap the map to drop a draggable pin, radius slider 10 to 500 m (circle drawn on the map), "Use my location", collapsible lat/lon fallback.
- **Group area** modes: Neighborhoods (search plus checkboxes, max 10, merged), Circle (pin plus 50 to 1500 m slider), Draw (tap corners, drag to adjust, Undo and Clear, live area, 3 to 60 corners).
- All three are normalized server-side into one stored MultiPolygon (`sponsorships.area_geometry`, `area_name`, `area_source`, target_type `area`). The map layer and the "event inside area" check read that single column. Legacy single-geo-unit group areas were backfilled.
- Server limits (the client only hints): drawn shape area 2,000 sq m to 5 sq km, drawn shapes must not cross themselves, max 60 corners, site radius 10 to 500 m, boundaries max 10, only Trash War types (neighborhoods, zip, UK postcode district), enforced server side.

Tests:
1. Place a site by tapping, dragging the pin, and "Use my location"; confirm the radius circle follows the slider.
2. Group area, Neighborhoods: pick 2, confirm default name; pick an 11th is blocked.
3. Circle: confirm 50 m and 1500 m both work; tiny and huge handled by slider bounds.
4. Draw: bow-tie shape shows a red outline and a crossing message and the form refuses; a very large shape shows the too-large message; a valid shape submits.
5. Confirm a drawn area shows as a dashed outline on the campaign map and that an event outside it cannot use the pool.
6. Bypass the UI (curl a 5000 m circle) and confirm a 422.

## 4. Order of work

1. Mock seeder (section 2), so everything above is testable.
2. Walk through the section 1 table on desktop and a phone-width window.
3. Map layer (section 3).
4. Stripe test keys, then live checkout and webhook testing.

## 5. Frontline Plus redesign tests (BUILT, migration 118, untested in a browser)

1. Non-Plus profile: card shows pitch, perk list and one Get Plus button, no portal or refresh. Recap card shows a note instead of Share.
2. Mock-Plus profile: gold name, avatar ring, Plus badge, "Plus member since <date>", "Renews <date>". Mock rows show an admin-only note instead of Manage subscription.
3. Share this card: on desktop it downloads a PNG, on a phone it opens the share sheet. Check the numbers match the profile.
4. Earning caps: with Plus, a user can exceed the default per-pool cap (up to 2x) and the daily cap; explicit sponsor-set pool caps are not raised. Setting `plus_earning_cap_multiplier` to 1 disables it.
5. Group Plus: badge beside the group name, group card copy differs from the user card.
6. Perk copy reads "2x earning caps on sponsored cleanups (per-sponsor and daily)". Change `plus_earning_cap_multiplier` and reload: the number follows it.

## 6. One-time donation, Plus flair everywhere, free test account (BUILT, untested in a browser)

1. Donate: on your own profile, below the Plus card there is an "Or give once" section (visible whether or not you are Plus). Pick $5/$10/$25/$50 or Other, optionally add a message, press Give. You are sent to Stripe Checkout for a one-time payment (needs Stripe test keys, see item 30). Amounts under $1 or over $10,000 are rejected. The gift lands as a "Frontline's general fund" sponsorship (pending until the webhook confirms).
2. Plus flair: a gold Plus pill shows next to Plus members' names on the global leaderboard, the campaign page leaderboard, team event stats leaderboard, and cleanup event attendee lists (both the RSVP list and the detailed list). Seed Plus with `POST /api/admin/seed/payments-mock?username=<name>`.
3. Flair respects the payments gate: with `payments_admin_preview` off, or payments disabled and you are not a site admin, no pill appears anywhere even though the API returns `is_plus`.
4. Free account: `POST /api/admin/seed/payments-mock?create_free_user=true` creates login `freeuser@example.com` / `password` (username `freeuser`), no subscription. It was created on the local DB on 2026-10-15. Log in with it to see the non-Plus profile, pitch and recap note. `remove=true` on the same endpoint deletes it along with the other mock data.
5. Group Plus flair: a Plus group's page shows a gold name and amber avatar ring with the badge, and the Plus pill appears next to the group on the global and campaign leaderboards.
6. The mock seeder now sets the renewal date one month out (older local mock rows still say 2036; that is placeholder data, real Stripe subscriptions show the real date).
7. Not covered by the flair yet: comments (no comment feature exists), group member lists, the admin panel.

## 7. Plus monetary incentives (BUILT, migration 119, untested in a browser)

1. Early access: fund a site or group area, then (as a non-Plus user, e.g. `freeuser`) open `/sponsorships`. Within the first `plus_early_access_hours` (default 48) of funding, the site shows "Plus early access. Opens to everyone <time>" and the Claim button is hidden. A Plus user sees "Plus early access until <time>" and can claim. Setting the game setting to 0 turns the window off.
2. Direct API check: a non-Plus user calling the claim endpoint inside the window gets a 403 "open to Frontline Plus members first".
3. Group areas: in the event creation picker, areas still inside the window are greyed out with the unlock time for non-Plus groups, selectable for Plus groups. Check both CreateCleanupEventForm and the ContributionPanel create modal.
4. Group cap: a group can earn at most `sponsored_default_cap_per_group_usd` (default $100) per pool, times `plus_earning_cap_multiplier` for Plus groups. Log a second sponsored event past the cap and confirm the extra is not queued.
5. Group settings: on a Plus group's edit page, the "Open to sponsors" toggle and pitch save. A non-Plus group's edit page does not show it.
6. Support card: with the toggle on, the group page shows "Support <group>" with $10/$25/$50/$100/Other, min $5, max $10,000. Logged out shows a sign-in link. Needs Stripe test keys to complete.
7. After the webhook marks it funded, one allocation appears in the review queue labelled "Direct group support". Approve it, then mark paid out. A group that loses Plus or turns the toggle off refuses new checkouts.
8. Funding hub: the gift shows as "<sponsor> sponsored <group> for $X" with no pool-remaining line.
9. Perk copy: the Plus card lists the early access hours (follows `plus_early_access_hours`), higher group cap, open to sponsors, and "Coming soon" rewards. Rewards are copy only, no fulfillment.


## 8. Fund cleanups form rework (BUILT, untested in a browser)

1. Page order ends with Allocation review then All sponsorships (admin only).
2. Cleanup site: the picker map has a basemap switch, expand, and "zoom to my location"; address search places the pin; "Put the pin where I am" works; no coordinates entry; claim radius slider explains itself.
3. Group area: boundary search works across all geo units (cities excluded) with an optional type filter, up to 10 chips; Circle is gone; drawn shapes show a size meter with min and max.
4. "How it pays out": One payout / Fixed amount / Per bag (site), Fixed / Per bag / Per attendee (area). The preview note explains uneven totals (last payout takes what is left). "Most one person can earn" appears for sites only.
5. "As a business" is disabled with a Partners link when you run no business; otherwise it lists only businesses you created or manage. Posting a business you do not belong to returns 403.
6. Funding walkthrough matches the new options.
7. All sponsorship maps share one set of buttons (expand, zoom to everything, zoom to my location with a blue dot) and default to Terrain.
8. "What this will look like" at the bottom of the form reflects the total, payout, and per-person limit entered, including Frontline defaults and the Plus multiplier.
