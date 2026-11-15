# Crowdfund Pools: v1 and Future Directions

Notes written 2026-11-14. v1 is built on the `money-and-payments` branch (migrations 142 and 154 to 157). Nothing here is on prod yet. The first half describes what is built, the second half is unscoped ideas.

# Part 1: What v1 is

A pool is a funding source for something one person cannot afford alone, for example a very bad area that needs a big pot.

- Starter fills in a 3 step form (Basics, Where, Money). Where is one spot or a whole area. Money is an overall **goal**, a deadline (2 weeks, 30 or 60 days) and a pick-one option for what happens once the goal is met. Each option shows a one-line summary with an Adjust control.
- Neighbors contribute through Stripe Checkout. Frontline holds the money.
- Logged-out visitors can view a pool (when payments are live for everyone) but cannot chip in. Contributor names are visible to them.

## The five options after the goal is met

1. **Pay per cleanup** (suggested goal / 10). Becomes ONE funded sponsorship paying a flat amount per verified cleanup.
2. **Pay per bag.** Same, paid per bag with a bag cap.
3. **Jobs budget** (migration 157). The raised money is a budget the starter spends on marketplace jobs, never more than the unspent balance. Cleaners are paid by Stripe Connect transfer from the platform balance. The starter cannot approve work on their own pool; contributors approve or dispute (an admin can step in, and can freeze it). Closing the pool refunds the unspent balance pro rata.
4. **Hand to a group** (areas only, migration 156). A group admin has 7 days to accept. Accepting activates a sponsorship that only that group can host events on. Decline or silence sends the pool back to the starter to choose again.
5. **Contributor vote** (migration 156). One contributor, one vote, for about 7 days among the preset payout rules. The winner activates the pool. No votes at all refunds everyone. A chosen vote is final.

## Lifecycle

- When paid contributions reach the goal, the pool turns into its plan (a funded sponsorship, a group hand-off, a vote or a jobs budget). Sponsorships then follow the existing sponsored-site flow: claims, payouts, caps, Plus early access.
- Missed goal (migration 155): status `goal_missed`, with `missed_deadline` 14 days out. The starter chooses to run with what was raised (`/run`), extend (`/extend`), or cancel and refund. No action in 14 days refunds everyone.
- The starter (or an admin) can change the plan (`POST /sponsorship-pools/{id}/plan`) while raising, and after funding until the first payout.
- Cancelling refunds every paid contribution through Stripe.
- Per cleanup and per bag only pay people with payouts set up, about a $10 minimum payout. There is no equal-split attendee payout long term, because many tiny payouts need many payment accounts.

## Surfaces

- Map: open pools show a "funding in progress" pin with a progress ring. The popup has a progress bar and a link to the pool. Once funded, the sponsored site shows a "Community funded" badge.
- Pool page: progress card with an Add to the pool button, a location map with directions, share and QR, contributor list, and the starter's manage controls.

Key code: `backend/app/services/sponsorship_pools.py`, `backend/app/api/routes/sponsorship_pools.py`, `sponsored_cleanups.list_map_features`, `frontend/src/app/fund/pools/new/NewPoolForm.tsx`, `frontend/src/app/fund/pools/PayoutOptions.tsx`, `frontend/src/app/fund/pools/[id]/`, `frontend/src/components/map/useSponsoredMapLayer.ts`.

## Still unbuilt from the v1 list

- Per-contributor caps (the column exists, v1 passes none).
- Starter update posts, notifying contributors when the pool activates or refunds.
- A per-cleanup "max bags funded" limit.
- Ad hoc community events with no owning group, funded by a pool.
- Random money spots and the hotspot layer with photos (owner's ideas; the hotspot layer is thought to be the weakest).

## Open questions

- Should a pool starter be allowed to also contribute? (Probably yes, they are just the first contributor.)
- Fraud: the same rule as sponsorships applies (no paying a sponsor from their own money). Check that a starter cannot launder a pool into a site they then claim themselves.
- Fees: confirm the platform fee is taken once at activation, not per contribution, and that refunds return the full amount.
- Should logged-out visitors see contributor names? Today they do.
- Prod: migrations 146 to 157 must be applied by the user before any of this ships. The combined run sheet is `dev-docs/prod-migrations-146-157-combined.sql`.
- Legal: governance-style features (votes, collective funds, recurring pooling) were already flagged for review in the scope doc. Recurring pools in particular may look more like a fund.

# Part 2: Pools as a community feature, not just a funding pipe

Nothing here is scoped or built.

## The problem

Today a pool is a payment pipeline. People chip in, the money hits a goal, and it turns into a sponsorship, a group hand-off or a jobs budget. After that the pool page is a receipt.

That is thin, because adding to an existing sponsorship already lets people crowdfund in that sense. If a pool is only "money from many people goes into the existing flows", it duplicates top-ups with extra steps. The pool needs a reason to exist that a top-up does not have.

## What a pool can do that a top-up cannot

A top-up adds money to something that already exists and is already funded. A pool exists **before** there is anything to fund. That is the difference to lean into:

- **It is a rallying point.** Someone says "this place needs fixing" and asks neighbors to back it. The goal is to get people to show up for the idea, not just to move dollars.
- **It has a story.** A top-up has none. A pool can have a reason, photos, an owner, updates and an outcome.
- **It has an arc.** Raising, funded, work happening, done, results. A top-up is a single moment.
- **It can be bigger than money.** People can give time, skills, supplies or attention, not only cash.

So the reshape: treat the pool as a **campaign page for a place** that happens to be funded by money, with the funding being one part of it.

## Ideas, grouped

### 1. Make the page a living campaign (cheapest, highest payoff)

- **Starter updates.** Short posts with photos ("we have 60 percent, a group has offered to help"). Contributors get notified.
- **Before and after.** When work happens, show the cleanup photos on the pool page. The last state of a pool is a results page, not "Funded".
- **Impact summary.** Bags, miles, hours, people who took part, money spent versus raised. Doubles as a share card.
- **Comments or a short thread** so neighbors can say "I live here, this is the worst corner by the school". Keep it small and moderated, or skip until there is demand.
- **Share card and link preview** per pool, made to be posted to a neighborhood group chat.

### 2. Let people give more than money

- **Pledge time.** "I will join a cleanup day" counts toward the goal next to dollars. A pool with 40 dollar donors and 25 volunteers is a stronger signal than either alone, and it gives a group or the starter a ready crew.
- **Pledge supplies.** Bags, gloves, grabbers, a truck. A simple "I can bring X" list.
- **Spread the word.** Invite or share counts show on the page (social proof, not a reward).

### 3. Tie the pool to events and groups

- **Pool day.** When funded, the starter (or the group it was handed to) schedules a cleanup event from the pool page. Contributors and volunteers are invited, and RSVPs are tied to the pool. This is the "community day" idea without needing a new payout type.
- **Group-backed pools.** A group starts a pool for its own area, so its members and followers are the first contributors. Likely the strongest source of real traction.
- **Frontline community day** (deferred, noted earlier): a platform-wide day with pools as the local anchors.

### 4. Recognition and gentle game layer

- **Contributor wall** with names (opt-in anonymous), first backer, biggest backer, and a "backed N places" tally on profiles.
- **Badges** for backing, for volunteering, for finishing a pool. Fits the existing gamified direction.
- **Milestones and stretch goals** ("at $1,500 we add a second cleanup day"). Gives people a reason to push past the goal, and avoids the dead end of a pool that hits 100 percent and goes quiet.
- **Neighborhood or city boards:** pools that are close to funded, most backed this week. Fits the map and the still-open Fund tab crowdfund spot.

### 5. Recurring and adopt-a-place

- **Adopt a spot.** A pool that keeps running: a monthly goal for a block, park or stretch of shoreline. Backers fund a standing sponsorship that renews instead of a one-off.
- **Seasonal pools** (spring cleanup, after-storm cleanup, leaf season).
- This is the clearest answer to "why not just top up": a top-up is a gift to one sponsorship, adopt-a-spot is an ongoing relationship with a place.

### 6. Match and challenge

- **Business or group match.** A local business offers to match donations up to a cap. Partner pages already exist, so this could hang off those.
- **Challenge pools.** Two neighborhoods or two groups race to fund and clean their spot. Optional, only worth it if there is a real community already using the app.
- **Random or hidden money spots** (from the owner's earlier list). Still a good fit for the game layer, but it is a separate feature that a pool could later seed.

## How this relates to top-ups

Keep both, and make the line clear in the UI:

| | Top-up | Pool |
|---|---|---|
| When | A sponsorship already exists and is funded | Nothing is funded yet |
| Purpose | Add more money to something live | Rally people to get something started |
| Page | The site / sponsorship page | A campaign page with a story and updates |
| Ends | Money is added | Becomes a sponsorship, a group hand-off or a jobs budget, then a results page |

Possible bridge: when a pool funds, its page stays alive as the **history and community page** for that site, and the site page links back to it. Top-ups on that site could then show up as contributions in the same list, so there is one place where all backers appear.

## Suggested order

1. Starter updates, results page and share card (reuses what exists, no new money flows).
2. Pool day: schedule an event from a funded pool, invite contributors. Plus volunteer and supply pledges.
3. Group-started pools and a Fund-tab section for pools near their goal.
4. Contributor recognition and stretch goals.
5. Adopt-a-spot recurring pools (needs a renewal and refund design).
6. Business match and challenge pools (needs partners and real usage first).

## Open questions for these ideas

- Should top-ups and pool contributions merge into one backer list on a site? It makes the page feel richer but touches the sponsorship payment records.
- Do volunteers count toward the goal visually, or only dollars? Probably show both and keep the goal in dollars.
- Moderation: updates and comments from starters on a page with real money need an admin report path before they ship.
- Which one idea is the best first bet? A guess: pool day plus starter updates, because it makes the pool a thing people show up to.
