# Business Proximity Cleanup Bonus — Scoping — 2026-08-14

**Status: scoping only, nothing built.**

## The idea

Reward cleanups done near a partner business, to (a) drive real foot traffic and a cleaner block around the store, and (b) give the partner team a concrete pitch when recruiting new business partners ("cleanups near your store already earn people bonus points/rewards — you don't have to do anything").

Two variants came up, and they solve different problems — worth scoping both rather than picking one now:

### Variant A — Passive proximity bonus (platform-funded)
Any cleanup contribution within a business's bonus radius gets a score multiplier automatically, same shape as the hotspot bonus today. No partner action required. When it applies, the cleanup log modal shows something like the hotspot banner: *"🏪 X× bonus — you cleaned up near a Frontline partner!"*
- Pitch to a prospective partner: "being on the map already gets your block cleaned more."
- Zero partner-facing UI needed for v1 — just a radius field + the same scoring hook the hotspot multiplier uses.

### Variant B — Partner-listed exclusive reward (partner-funded)
A partner can list an offer in `partner_offers` that's only claimable if the qualifying cleanup(s) happened inside their bonus radius — the inverse of Variant A: instead of a generic points bump, it's a specific reward gated on proximity, e.g. "free coffee for cleaning up within 2 blocks of us."
- Pitch to a prospective partner: "you control it — list a reward, decide the radius, and you're the reason it's redeemable."
- Needs new eligibility plumbing on the redemption side (see below), since `partner_offers` currently has no concept of "must have earned this via a qualifying nearby contribution."

These aren't mutually exclusive — A is a passive always-on platform incentive, B is an opt-in partner tool. Both could ship; A is by far the smaller lift and could go first.

## Radius: dedicated bonus radius, decoupled from the display radius

The existing radius-of-influence field (block/neighborhood/wide tiers on `partner_business_locations`) is purely a *display/query* scope for the partner dashboard's activity view today — it has zero functional effect on scoring or rewards (confirmed: no radius field feeds into `contribution_scoring.py`).

Decision: the bonus radius is a **separate field**, not reusing the display tiers. Rationale (matches the "right around the store" intent) — the display radius is about *showing a partner what's happening nearby* (can reasonably be "wide"), while the bonus radius is about *incentivizing cleanup close enough to plausibly bring someone into the store* (should default tighter, e.g. block-tier only, independent of whatever display radius is set).

## How it hooks into existing mechanics

**Scoring (Variant A):** `contribution_scoring.py` already has a generalized `effect_config->>'type' = 'score_multiplier'` pattern used by the hotspot bonus, matched by `geo_unit_id`. Proximity-based matching needs a variant of this lookup keyed on `ST_DWithin(contribution.location, business_location.location, bonus_radius_m)` instead of geo_unit equality — same shape, different spatial predicate. The existing "don't stack, take the max" rule (hotspot vs. challenge multiplier) would need to decide where a business-proximity multiplier sits in that ordering — stacks with hotspot, or also take-the-max? Recommend take-the-max initially, consistent with the existing pattern, until there's a reason to allow stacking.

**UI (Variant A):** `ContributionPanel.tsx` already has the full pattern for this — `activeMultiplier` state fetched from `/api/events/campaign/{id}/active-multiplier`, a pre-submit banner, and a post-submit `appliedMultiplier` confirmation with the "X× bonus applied" styling. A business-proximity bonus would add a second multiplier source, feeding the same `combinedMultiplier = Math.max(...)` logic and banner components, distinguished only by icon/copy (🏪 vs 🔥) and title (business name vs. "Hotspot").

**Redemption (Variant B):** `partner_offers` → `partner_offer_codes` → `partner_redemptions` has no eligibility gate today beyond points balance. A proximity-gated offer needs either:
- a claim-time check (server verifies the user has a qualifying contribution — cleanup within this business's radius, within some recency window — before honoring redemption), or
- an earn-time credit (a qualifying nearby cleanup mints a business-specific claim/stamp immediately, redeemable later without a second check).
The claim-time check is simpler (no new stored state) but requires defining "qualifying" precisely — one cleanup ever, one per offer, one per time window? The earn-time credit is more work but matches a "stamp card" mental model partners will intuitively understand when pitched.

## Open questions before this gets built

1. **Ship order** — Variant A first (small, reuses existing scoring pattern) with Variant B as a later partner-facing tool once there's partner demand for it? Or scope both together since the sales pitch benefits from having both to show?
2. **Bonus radius default/range** — same three tiers as display (91m/396m/1524m) or a new, generally-tighter set of values specific to "bring foot traffic to the door"?
3. **Multiplier value** — reuse `hotspot_multiplier`-style game setting (single global value) or per-business (lets a partner offer a bigger incentive, but adds a field + admin UI)?
4. **Variant B eligibility window** — does a qualifying cleanup need to happen *before* redemption (proof-of-work) or can any nearby cleanup ever unlock the offer indefinitely? Affects whether this needs a recency check.
5. **Abuse guardrails** — a proximity multiplier is exploitable the same way hotspot is (though smaller blast radius since it's one business, not a whole zip) — worth the same "does this need rate-limiting per user per business" question hotspot scoring already has to deal with, if it doesn't already.

## Suggested phase order

1. Add dedicated bonus-radius field to `partner_business_locations` (admin-settable, not partner self-serve yet).
2. Variant A: proximity score-multiplier hook in `contribution_scoring.py` + `active-multiplier` endpoint + `ContributionPanel` banner (reuse existing components, new source).
3. Validate with real partners / usage data before building Variant B's redemption-eligibility plumbing — worth knowing whether Variant A alone already moves the needle on foot traffic before investing in the heavier partner-funded-offer path.
4. Variant B once there's partner pull for it: eligibility gate on `partner_offers`, partner-facing UI to set radius + reward.
