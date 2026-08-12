# Partner Offer Suggestions (2026-08-12)

Reference doc for pitching offer tiers to new business partners via email. Based on the current points system (`game_settings` table), the two live partner offers, and points distribution on the local dev DB.

## How points work today

| Action | Points |
|---|---|
| Small trash bag logged | 1 |
| Large trash bag logged | 3 |
| Per pound of trash logged | 0.5 |
| Submitting a problem/trash report | 0.5 |
| Cleanup event check-in (once per event) | 5 |
| Solarpunk photo action | 1 |
| Solarpunk civic action | 2 |
| Claim-challenge resolution | ×1.5 multiplier |
| Hotspot event | ×2 multiplier (doesn't stack with claim-challenge) |

Milestone badges fire at 25 / 100 / 500 / 1,500 / 5,000 lifetime points, but those are notification triggers only — no bonus points attached.

Two redemption modes exist for partner offers:
- **Spend**: deducts `points_cost` from the user's redeemable balance (`spendable_points`).
- **Threshold**: just requires the user have reached `points_threshold` lifetime points — nothing is deducted, so it can be redeemed repeatedly (still capped by `max_redemptions_per_user` / `max_total_redemptions` if set).

## Where users actually sit (points balance)

Pulled from the local dev DB (26 seeded users with points > 0) — **not prod**. Treat this as a rough shape, not a hard number; worth re-checking against the prod leaderboard before finalizing tiers.

- Min: 1 · Median: 10.5 · Mean: 13.8 · P90: 27 · Max: 52.5
- Top 10 scores: 52.5, 46, 27, 25.5, 21.5, 20.5, 20.5, 16.5, 15.5, 10.5

At this range, a **5-10 point cleanup event nets a user roughly 1-2 events'** worth of points. A 100-point offer (like Hart Kitchen's current one) is out of reach for every dev-seeded user right now — fine as an aspirational "whale" tier, but partners should also offer something reachable after just one or two cleanups if the goal is to hook new users early.

## Existing live offers (for calibration)

| Partner | Offer | Cost | Mode |
|---|---|---|---|
| Hart Kitchen | 10% off any order | 100 pts | spend |
| Bushwick Bark | 1 free treat (dog treat <$5, or cat churu pack) | 25 pts | spend |

## Suggested standard offer tiers

**Starter tier — 10-15 points** (reachable after 2-3 cleanup check-ins, or one event + a couple bag logs)
- Free drip coffee / small item add-on
- $1-2 off any purchase
- Free item with any purchase ("buy one, get a free X")

**Core tier — 20-30 points** (matches the current Bushwick Bark offer; reachable by an engaged user in their first couple weeks)
- 10% off a purchase
- Free small menu item (pastry, side, drink)
- $5 off a $25+ purchase

**Loyalty tier — 50-75 points** (reachable by top-10%-ish users, rewards sustained participation)
- 20% off a purchase
- Free entrée / larger free item
- $10-15 off purchase

**Champion tier — 100+ points** (aspirational; top contributors only — good for partners who want a flagship "wow" offer)
- Buy-one-get-one-free
- Large % off (25%+) or flat $20+ off
- Free service/class/session

**Threshold-mode alternative** (repeatable perk instead of a one-time redemption):
- "Show your Frontline profile at 25+ points for 10% off, anytime" — good for partners who want ongoing foot traffic rather than a single redemption event.

## Email-ready blurb

> Offers typically range from a free small item (~10-15 points, earned in 2-3 cleanups) up to a bigger perk like 20% off or a free entrée (~50-75 points, for our most active volunteers). Most partners start with one starter-tier offer and one loyalty-tier offer to reward both new and repeat participants.

## Plain text version (copy/paste into emails)

```
Here are some standard offer ideas partners have used on Frontline. Volunteers earn points by attending cleanups and logging trash (roughly 5 points per cleanup check-in, 1-3 points per bag logged), so these tiers are based on how many cleanups it typically takes to reach each level.

CURRENT TRASH WAR POINT VALUES
- Small trash bag logged: 1 point
- Large trash bag logged: 3 points
- Trash logged by weight: 0.5 points per pound
- Problem/trash report submitted: 0.5 points
- Cleanup event check-in (once per event): 5 points
- Claim-challenge resolution: 1.5x multiplier on the contribution's points
- Hotspot event: 2x multiplier on the contribution's points (does not stack with claim-challenge)

STARTER (about 10-15 points, ~2-3 cleanups)
- Free drip coffee or small item add-on
- $1-2 off any purchase
- Free item with any purchase

CORE (about 20-30 points, a couple weeks of regular participation)
- 10% off a purchase
- Free small menu item (pastry, side, drink)
- $5 off a $25+ purchase

LOYALTY (about 50-75 points, our most active volunteers)
- 20% off a purchase
- Free entree or larger free item
- $10-15 off a purchase

CHAMPION (100+ points, top contributors only)
- Buy-one-get-one-free
- 25%+ off or $20+ off
- Free service, class, or session

ONGOING PERK (alternative to a one-time redemption)
- "Show your Frontline profile at 25+ points for 10% off, anytime" - rewards repeat visits instead of a single redemption

Most partners start with one Starter-tier offer and one Loyalty-tier offer, so both new and repeat volunteers have something to redeem.
```

## Caveats

- Point distribution above is from local dev/seed data, not production. Re-pull the same query against prod (Supabase dashboard SQL editor, not from this machine per [[project_in_production]] rules) before locking in final tiers.
- No referral or streak bonuses exist yet, so points are earned purely through logging trash/attending cleanups/civic actions — offer framing should lean on "come to a cleanup" rather than "invite a friend."
