# Equipment Supply Stations: Scoping (2026-10-18)

**Status: scoping only, nothing started. Priority: HIGH (todo.md Now).** Working title: **Supply Stations**. Locations on the map where people and groups can pick up cleanup and greening supplies for free, hosted mainly by partner businesses. Related docs: `business-proximity-cleanup-bonus-scoping-2026-08-14`, `event-redeemable-offers-and-nearby-business-suggestions-scoping-2026-08-26`, `partner-offer-suggestions-2026-08-12`, `granular-bag-tracking-scoping-2026-09-02`, `user-gamification-scoping-2026-10-17`, and the payments v2 docs on the `money-and-payments` branch (sponsorships).

Rule for everything here: the app is in production, so additive changes only, mobile-first design, seed data through the Seeder registry + `POST /admin/seed`, and no migrations applied to prod by Claude. Doc names and migration numbers: check `branch-tracker.md` before picking a number.

## The idea

Today a person or group who wants to clean has to already own bags, gloves and a picker. That is a real barrier for new users and for casual group events. Meanwhile partner businesses want foot traffic and a way to show they care about the block.

Supply Stations connect the two:
- A partner business **opts in** to keep a small stock of supplies at one or more of its locations.
- The map shows where those stations are and what each one has, so an individual or an event organizer knows exactly where to go.
- People walk in to pick up supplies, which brings them through the door (some will buy something). The business gets visibility, stats and rewards for hosting.

### Item tiers (what a business can stock)

| Tier | Items | Notes |
|------|-------|-------|
| **Core cleanup** (the default ask) | trash bags, gloves, safety vests, trash pickers (grabbers) | Cheap, low liability, high demand. Bags and gloves are consumable, vests and pickers are loanable. |
| **Optional large** | shovels, rakes, wheelbarrow, brooms, buckets | Loan only. Higher value, higher liability, bigger ask of the business. |
| **Greening** | mulch, soil/dirt, compost, seeds, small plants/seedlings, watering cans, gardening gloves | Ties into the new greening point-earning actions (todo.md Now). Some are bulky or perishable. |
| **Other** | first aid kit, sunscreen, water, sharps container | Open question, see safety below. |

Each station picks any subset. Core cleanup is the recommended starter kit so the pitch is simple: "keep a box of bags, gloves, vests and pickers by the door."

### Item modes

- **Take** (consumables): bags, gloves, seeds, soil. Free to take, no return.
- **Borrow** (loanables): vests, pickers, shovels. Take it, bring it back after the cleanup. Honor system in v1, tracking later.
- **Reserve** (bulk, for groups): "30 bags, 20 vests, 10 pickers for Saturday." Business approves or declines. Needs lead time.

## What already exists (build on, do not rebuild)

- `partner_businesses` and `partner_business_locations` (migration 074): a business has any number of locations, each with lat/lng, status, RLS for site admin and business admins. **Supply availability belongs per location**, not per business.
- `partner_business_admins` and the partner dashboard (`frontend/src/app/partners/dashboard/PartnerDashboardClient.tsx`): where a business would opt in and manage stock.
- Partner apply flow (`BusinessForm.tsx`, `/partners/apply`): can gain an "I'd like to host a supply station" checkbox so recruiting and opt-in happen at the same moment.
- Map: `PartnersMap.tsx` and the partner markers in `CampaignMap.tsx`. A "Supply Stations" layer or filter is an extension of these.
- `frontend/src/lib/nearbyPartners.ts` and the nearby-business suggestions on events (piece 2 of event-redeemable-offers, still on the Verify list in todo.md): the natural place to say "get supplies near this event."
- `partner_offers`, `partner_offer_codes`, `partner_redemptions`: existing reward rails that a supply pickup could unlock (see rewards below).
- Business proximity bonus scoping (Variant A, passive multiplier near partners): supply stations are a stronger version of the same idea and could get a bigger radius or multiplier.
- Cleanup events, group events and organizer tooling for the group side of reservations.
- `LEGAL_GATE_ENABLED` terms flow, for borrowing terms.

## Data model (proposal, additive only)

1. **`supply_item_types`**: admin-managed catalog. `slug`, `name`, `tier` (core, large, greening, other), `mode` (take, borrow, reserve_only), `icon`, `unit` (each, bag, lb), `is_starter` (part of the recommended kit), `sort_order`, `active`. Seeded through the Seeder registry.
2. **`supply_stations`** (or columns on `partner_business_locations`): one row per opted-in location. `location_id` unique, `status` (active, paused), `pickup_instructions` ("ask at the front counter", "box by the door"), `pickup_hours` (can default to open hours, free text in v1), `accepts_reservations`, `contact_note`, `opted_in_at`. A separate table keeps the location table untouched and makes "which locations are stations" a clean join. Decide table vs. columns in the build scoping.
3. **`supply_station_items`**: `station_id`, `item_type_id`, `availability` (in_stock, low, out), `quantity_note` (optional, "about 40 bags"), `last_confirmed_at`, `updated_by`. Three states instead of exact counts, because businesses will not maintain inventory numbers. `last_confirmed_at` drives freshness (below).
4. **`supply_pickups`** (phase 2): `id`, `station_id`, `user_id`, `items` (jsonb), `cleanup_event_id` nullable, `picked_up_at`, `confirmed_by` (staff tap, QR scan, or self-report), `status`. Feeds business stats and rewards.
5. **`supply_reservations`** (phase 3): `station_id`, `requested_by` (user or group), `cleanup_event_id`, `items` (jsonb with quantities), `needed_by`, `status` (requested, approved, declined, picked_up, cancelled), business note. Reuse the email pipeline for request and approval notices (ties to the planned partner/organizer coordination email, see todo.md email audit).

RLS shape follows `partner_business_locations`: active stations public, writes by site admin or that business's admins. Pickups readable by the user and the station's business admins. All new tables go through normal migrations; applying to prod is the user's job.

## Keeping stock honest (the hard part)

The feature dies if the map says "bags available" and the shelf is empty. Businesses will not update inventory daily. Mitigations:

- **Three states, not counts.** In stock, low, out. One tap.
- **Freshness.** Show "confirmed 3 days ago." After N days with no confirmation, the item shows as "unconfirmed" and then drops off the map filter. N is a `game_settings` style tunable.
- **One-tap confirm.** A weekly email or push to the business admin with "Still stocked? Yes / Low / Out" buttons that work without logging in (signed link). Also a "Confirm all" button on the dashboard.
- **User feedback.** After a pickup (or from the pin), "Was it there?" yes/no. Two or three "no" reports flag the item as out and notify the business.
- **Auto-low from volume.** If phase 2 tracks pickups, a station that has served X bags since the last restock confirmation can be nudged to "low."
- **Frontline restock help.** Admins can see which stations are low or stale and message the business, or ship a refill (see funding).

## Who pays for the supplies

Open and central, since bags and vests add up. Options, not mutually exclusive:
- **Business funds its own.** Cheapest for us, hardest recruiting pitch. Bags and gloves are pennies per person; vests and pickers are the real cost.
- **Frontline starter kit.** Ship a free kit to each new station (box of bags and gloves, a few vests and pickers, window decal). Paid from sponsorship money or a grant.
- **Sponsor-funded.** A sponsor (via payments v2 sponsorships) pays for kits for N stations and gets named on them ("Stocked by X"). Strong fit with the money-and-payments branch.
- **City or nonprofit supply.** Many cities and Keep-X-Beautiful style groups already give away bags, gloves and pickers for free. A refill pipeline from them could cover most of the core tier. Worth a research task.
- **Group donations.** Groups that fundraise or receive donated gear could stock a station.

## Rewards for businesses (the "why would I sign up")

Grouped by what the business actually cares about. Each one is a candidate, not a commitment.

**Visibility**
- Distinct **Supply Station pin** on the map, plus a "Supply Stations" filter people will use constantly. Stations rank first in nearby-business suggestions on events and in the cleanup flow.
- A **Supply Station badge** on the business's partner page (`/partners/[slug]`) and in the app.
- Window or counter **decal with a QR code** linking to the station page. Cheap for us, advertises the program and sends people to the app.
- Social shoutouts when a station launches or hits a milestone; feature in group content (ties to the "group social media content" gamification item).

**Foot traffic and revenue**
- **Pickup pass**: a user taps "I'm picking up supplies" and gets a pass to show at the counter. The same pass can carry a business offer from `partner_offers` ("show your pickup pass, 10% off today"), so a free-bags trip becomes a sale. This reuses the redemption rails.
- **Points for the person picking up** (small, capped per day), so there is an in-app reason to visit a station even before a cleanup.
- **Stay and shop prompt**: after pickup, the app suggests the business's active offers.
- Optional: a boosted proximity bonus (see business-proximity scoping) for cleanups near a station, which sends cleanup volume past the door.

**Impact and bragging rights**
- **Station impact page** on the partner dashboard: pickups served, unique people, bags/pounds collected by people who picked up there (when a cleanup is linked to a pickup), cleanups launched from this station, repeat visitors. This is the sales proof for the business and for a sponsor.
- **Share card** for the business: "Our supplies helped clean up 312 bags this quarter."
- **Tiers or titles** by pickups served or cleanups enabled (for example Supply Station, then Champion, then Anchor). Show on the map pin and partner page. Leaderboard of businesses by impact, opt-in.
- **Station-hosted cleanup events**: group events can use a station as the meeting point and start location ("starts at X Cafe"), putting a group of people in the store before and after.

**Money and perks**
- Free or discounted partner listing and priority placement for stations, ties to the Frontline Plus and sponsorship work on `money-and-payments`.
- **Sponsor matching**: a sponsor underwrites the station and the business gets a visible co-brand and restock credit.
- Possible **in-kind donation receipt** for the supplies provided. Needs checking against Frontline's actual legal and tax status before promising anything. Do not offer until confirmed.
- Early access to new partner features and a named seat in press or "community partners" material.

Recommended v1 set (low build cost, high perceived value): map pin and badge, decal, pickup pass tied to an existing offer, the impact page, and a Frontline starter kit.

## User-facing design (mobile first)

- **Map**: "Supply Stations" layer toggle plus item filter chips (Bags, Vests, Pickers, Shovels, Plants). Pin detail card: business name, distance, items with availability dots and "confirmed Xd ago," pickup instructions, hours, directions button (note the iOS Apple Maps item in todo.md Later), and "Pick up here" for phase 2.
- **Cleanup flow**: before logging or starting a cleanup, "Need supplies? Nearest station is 0.4 mi away." Especially on first-cleanup and the future first-cleanup guide.
- **Cleanup event page and creation**: organizers see nearby stations, and in phase 3 can "Request supplies for this event." Attendees see "Supplies available nearby" on the event.
- **Group page**: groups can see stations in their area and keep a standing preferred station.
- **Partner dashboard**: "Supply Station" tab. Opt-in toggle per location, item checklist with starter kit preselected, availability toggles, confirm-all, pickup instructions, reservation inbox (phase 3), impact stats (phase 2).
- **Admin**: list of stations, stale or low flags, kit shipping status, item catalog management, pause or remove a station.
- **Greening**: plant and mulch items should surface in the same filter, and link to the new greening point-earning actions when those exist.

## Individuals, groups and businesses (how each uses it)

- **Individual**: finds the nearest station, grabs a bag, gloves and picker, cleans, logs. Low friction, no reservation. This is the acquisition and retention win (new users no longer need their own gear).
- **Group or organizer**: either takes a few things the same way, or sends a bulk **reservation** tied to a cleanup event. Group can name a preferred station. Stations also work as event meeting points.
- **Business**: opts in per location, picks items, keeps it stocked, confirms weekly, sees impact, gets rewards.
- **Later**: groups and other hosts (libraries, community centers, schools, churches, city offices, nonprofits) as station hosts, and group-owned shared gear depots. Out of scope for v1, but keep the data model host-agnostic (a station links to a location, not strictly to a business).

## Risks and open questions

**Safety and liability**
- Tools (shovels, pickers) and sharps. Do not stock sharps containers or encourage handling needles; state clearly on the app. Add borrowing terms to the legal gate and a "business is not liable" line. Needs a legal sanity check.
- Vests for people near roads. Keep standard guidance in-app.

**Abuse and fairness**
- People taking a whole box. Rate-limit pickups per user per day in the app, and let the business set a per-visit limit note. Reservation flow handles bulk legitimately.
- Fake pickup claims to farm points. Keep pickup points small and capped, and require a confirmation (staff tap or QR) before any real reward. Self-report only for the map "was it there" feedback.

**Product**
1. **Name**: Supply Stations vs. Gear Stations vs. Pickup Spots vs. Trash Kits. Pick before decal printing.
2. **Verify pickups or not in v1?** Phase 1 ships without pickup tracking (just a map and a stock list). Is that enough to start recruiting, or does the pitch need stats from day one?
3. **Loanables: honor system or tracked?** Vests and pickers walk away. Start honor system, track later, or take a deposit (probably not)?
4. **How does a staff member confirm a pickup?** Customer shows a pass and staff taps in the business dashboard, customer scans a counter QR, or geofenced self-confirm. Staff time is the cost the business is trying to avoid, so the lightest option wins.
5. **Reservation lead time and default response**: is auto-approve for small asks reasonable?
6. **Who pays**: business, Frontline, sponsor, city. Need real numbers for a starter kit cost.
7. **Which existing partners to pilot with**: 3 to 5, ideally ones near active groups. Talk to them before building more than phase 1.
8. **Reward budget**: which of the business rewards above are free for us (badge, decal, map placement, impact page) vs. cost money (kit, discounts)?
9. **Seasonality**: greening items and cold weather. Pairs with the winter-proof actions item in todo.md Now.
10. **Do stations get a bigger proximity multiplier**, or just visibility? Decide with the business proximity bonus work.
11. **Business-only users** (migration 048): confirm a business admin without a normal profile can use the new dashboard tab.
12. **Impact attribution**: how do we link a cleanup to a pickup (same day, same user, optional "used supplies from X" checkbox on the cleanup log)? Needed for the "bags enabled by your supplies" stat.

## Suggested phases

**Phase 0: validate (before any code).** Talk to 3 to 5 existing partners and a couple of active groups. Price a starter kit. Research free supply sources from the city and nonprofits. Pick the name. Draft the borrowing terms. Confirm which business rewards we are willing to fund.

**Phase 1: map + stock list (MVP).**
- Migration: `supply_item_types`, station table, `supply_station_items`. Seed the catalog via the Seeder registry.
- Partner dashboard tab: opt-in per location, item checklist, availability toggles, pickup instructions.
- Opt-in checkbox on the partner apply form.
- Map layer, item filter chips, pin detail with freshness label.
- Admin list view with stale and low flags.
- Weekly "still stocked?" email with signed one-tap links.
- Docs: update `external-docs/app-capability-doc.md` and `campaign-app-scope.md`.

**Phase 2: pickups and business payoff.**
- Pickup pass, staff or QR confirmation, `supply_pickups`.
- Small capped points for pickups, "Was it there?" feedback.
- Pickup pass linked to a `partner_offers` offer (stay and shop).
- Station impact page on the partner dashboard, business share card.
- "Need supplies?" prompt in the cleanup and first-cleanup flows.

**Phase 3: groups and events.**
- Nearby stations on cleanup event pages and creation.
- Bulk reservations with approval emails (`supply_reservations`).
- Station as event meeting point.

**Phase 4: reward tiers and growth.**
- Business tiers or titles, optional business leaderboard, decal with QR program, social shoutouts.
- Sponsor-funded kits via payments v2 sponsorships.
- Loanable tracking if honor system proves leaky.
- Non-business hosts and group-owned depots.

## Success measures

- Number of active stations and share that are confirmed in the last 14 days (freshness is the health metric).
- Pickups per station per month, and unique pickers.
- Share of new users whose first cleanup followed a pickup.
- Bags logged per pickup (impact attribution).
- Business retention after 90 days and the share still confirming stock.
- Offer redemptions tied to pickup passes (the foot traffic proof).
