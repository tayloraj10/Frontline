# Payments v2 verification checklist (saved 2026-10-16)

Everything here is uncommitted on `money-and-payments` and has not been checked in a browser by Claude. Anything the user already confirmed is not listed. The older, fuller walkthrough is `dev-docs/payments-v2-test-plan-2026-10-15.md`; this list covers the recent rounds and what is still open.

## Setup reminders
- Local only: migrations 109-120. Prod needs the user to apply them (120 renames and converts the three cap settings to `_usd`).
- Toggles: `payments_admin_preview` on, `payments_enabled` off. Everything stays admin-only behind `paymentsVisible`.
- Test account: `freeuser@example.com` / `password`. Plus group: `bushwick-trash-club`.
- Local sponsorships: mock site pin ($10 flat / $50 pool) and group area "Bushwick (West)" ($25 flat / $100 pool, Plus early access locked until 2026-10-18T02:36Z).

## Sponsor form (/sponsorships)
1. Target modes Site, Group area and Donate each show the right fields.
2. Business sponsors only appear if allowed, and the server rejects others.
3. Site picker: place search, map click and drag.
4. Area builder: polygon, circle and boundary types.
5. Boundary picker map (untested):
   - Choose a boundary type, tap shapes to add or remove them.
   - Tapping past the limit shows the amber note.
   - Zip and UK shapes need zooming in first.
   - Address search flies the map.
   - Expand, locate and the Terrain/Streets/Satellite switcher work.
   - Chips match the picks.
6. Payout settings are in dollars (migration 120 applied locally).
7. Per-bag rate accepts $0.25. Max bags limited to 1-100. Preview shows worked examples and how many full cleanups the total covers.
8. "Total too low" message and payout summary look right.
9. "Most one person can earn" field works.

## Sponsored sites list
10. Payout limit card has space below it and reads "Your payout limit today".
11. Per-bag claim:
    - Bag input shows a live "N paid bags = $X".
    - Submitting without a count is blocked client-side, and the backend returns 422.
    - More than the max shows the "only first N bags paid" notice.
12. Capped payouts show the right notice, and the limit card updates after a claim.

## Maps
13. Site pins show a radius ring (green available, grey taken). It follows the Sites toggle and available-only filter and survives a basemap switch.
14. Claim from the popup, plus the proximity note.
15. Area labels declutter, and the overlap popup appears where pools stack.
16. Expand, zoom-all and locate controls match across all the maps.
17. Sponsored-areas toggle on the main CampaignMap.

## Event creation (both forms, keep in sync)
18. A "Sponsored area" step (after Location, before Nearby Partners) appears in both Host Event (`ContributionPanel.tsx`) and `CreateCleanupEventForm.tsx` only when the pin is inside a funded area. Not shown in edit mode.
19. Locked areas, reserved-out pools and Plus early access (needs a pool under 48 hours old) each show their note.
20. A non-group host sees the amber "only groups can earn" note.
21. Holds: the unreserved amount drops after another group's upcoming event picks the area.

## Event page (new 2026-10-16)
22. `/cleanup-events/[id]` shows the green "Sponsored cleanup" card for an event with an attached sponsorship, admin only. Status line moves from "Reserved" to "earned, waiting on review" to "paid out" as the allocation changes.

## Admin and rest
23. Allocation review queue, including "Direct group support", Mark paid out and Mark released.
24. Admin payout settings (`_usd` keys).
25. `/impact`, billing success and cancel pages, Frontline Plus pages.

## Blocked
- Real Stripe checkout and webhook (including a group Support gift): needs the user's Stripe test setup (the $5 Plus price, price IDs, webhook secret, `stripe listen`).

## Docs still owed
Scope doc, capability doc, branch tracker, backlog and the test plan still need entries for: map controls, claim-in-popup, pin markers and declutter, combined sites list, form changes, funding walkthrough, dollars-based settings (migration 120), daily limit and `/my-limits`, boundary picker and tile route, location-aware area picker, the Sponsored area step, pool holds, radius ring, per-bag changes, and the event page card.

## Open follow-ups
- Store the reported bag count on the allocation and show it in review (needs a migration); cap-reason reporting; small vs large bag handling; minimum-payout warning.
- Unused files to remove: `PersonalInsightsCard.tsx`, `SupporterBadge.tsx`, `groups/[slug]/stats/PremiumInsightsCard.tsx`, `app/sponsorships/SponsorExplainer.tsx`, the unused `canSeePayments` prop in `GroupStatsView`.
- Known gaps: real payouts and reward fulfillment are not built; allocation queue has no paging; the sites list loads up to 200 at once; `/api/sponsored` proxy turns non-JSON errors into `{}`; events cannot change sponsorship after create.
