# Event-Redeemable Offers + Nearby Business Suggestions — Scoping — 2026-08-26

**Status: Piece 1 and the email-notification follow-on are built (see `campaign-app-scope.md`'s "Event-redeemable offers" entry for what actually shipped, which diverges from the design below on eligibility scoping, redemption window, and redemption surface). Piece 2 (nearby-business suggestions) is not yet built.**

## The idea

This is already happening informally: a club/group cleans up somewhere, then walks over to a business the organizer happens to know, and attendees get free food/drinks as a thank-you. The ask is to formalize that pattern into two connected pieces:

1. A new **event-redeemable offer type** — a partner offer that's redeemable by attending/checking into a specific group cleanup event, instead of (or in addition to) spending points.
2. **Nearby-business suggestions during event creation** — when a group creates a cleanup event, surface partner businesses close to the event location with a contact card (email, socials) so the organizer can reach out and set this up themselves, even before an offer exists in the system.

These are separable and should probably ship in that order: (2) is a pure suggestion/discovery feature with no new redemption logic, and it's also useful as a lead-gen tool independent of whether (1) ever gets used by a given group. (1) is the "formalize it" piece and touches the offer/redemption schema.

## Piece 2 first, since it's the smaller lift: nearby-business suggestions at event creation

**What exists already that this reuses:**
- `partner_businesses` already has `lat`, `lng`, `address_line1/2`, `city/state/postal_code`, `website_url`, and a `social_links jsonb` column (`028_partner_business_location.sql`) — everything needed for a contact card already lives on this table. No new partner-facing data entry required as long as partners already have these fields filled in (worth an audit — `social_links` may be sparsely populated today).
- No `contact_email` column currently exists on `partner_businesses` — confirmed via schema search. If email is meant to go on the card, this needs a new column (or reuse `partner_business_admins`' owning user's email, if that table has a designated primary contact — worth checking before adding a duplicate email field).
- `CreateCleanupEventForm.tsx` already has a `GuidedStepper` flow with a dedicated **"Logistics & Location"** step, using `AddressAutocomplete` / `BusinessLocationMapPicker` for the event's location — this is the natural point to inject a "nearby partners" panel once a location is picked, not a new form step.
- Proximity querying already exists in spirit (business-proximity-cleanup-bonus scoping doc, `[[business-proximity-cleanup-bonus-scoping-2026-08-14]]`) — that doc proposes `ST_DWithin(contribution.location, business_location.location, radius_m)` for scoring; the same predicate against the event's chosen location works here, just for a read-only suggestion list instead of a scoring hook.

**What's new:**
- A `GET /partners/nearby?lat=&lng=&radius_m=` (or similar) endpoint returning active `partner_businesses` within some radius, sorted by distance. Small, reuses the existing `partner_businesses` table and location columns as-is.
- A frontend panel/card component in the "Logistics & Location" step — "Partners near this cleanup" — showing name, address, distance, website, socials, and (if added) contact email, with a note like "reach out directly to arrange a partner thank-you for attendees."
- Decide default radius — probably reuse whatever tier is closest to "walking distance after a cleanup" (the existing block/neighborhood/wide tiers, or a fixed ~0.5-1mi default) rather than inventing a new radius concept just for this.

**Rough size:** small — one read-only endpoint plus one UI panel, no schema changes unless contact email is added.

## Piece 1: event-redeemable offer type

**What exists today (`026_partner_businesses.sql`):** `partner_offers.redemption_mode` is a `CHECK (redemption_mode IN ('spend', 'threshold'))` with a matching `CONSTRAINT partner_offers_mode_field` requiring `points_cost` for `spend` and `points_threshold` for `threshold`. Redemption goes through `partner_offer_codes` (pool of single-use codes) and `partner_redemptions` (who claimed which code, `points_spent`).

**New mode: `redemption_mode = 'event'`**
- Add `'event'` to the `redemption_mode` CHECK, and either a new `event_id` column (offer tied to one specific, already-scheduled `cleanups` row) or an `event_group_id` column (offer tied to any event a given group hosts, more reusable). Recommend **group-scoped**, not single-event-scoped, since the same business/group relationship will likely repeat across multiple cleanups — a single-event offer would need to be recreated every time, which undercuts the "formalize this so it keeps happening" goal.
- The mode-field constraint needs a third branch: `(redemption_mode = 'event' AND event_group_id IS NOT NULL)`.
- **Eligibility check at redemption time**: instead of a points balance check, the redemption endpoint needs to verify the user attended a qualifying cleanup. `cleanups.attended_user_ids UUID[]` (`016_dogs_alignment.sql`) already tracks this per event — checking `auth.uid() = ANY(attended_user_ids)` on a `cleanups` row where `group_id = offer.event_group_id` and, likely, `status = 'completed'` is a straightforward query against existing data. No new attendance-tracking mechanism needed.
- **Window**: does attendance at *any* past event from that group qualify forever, or only the most recent one / one within N days? Recommend a recency window (e.g. "attended a qualifying event within the last 7 days") so this reads as "thank you for today's cleanup," not "you're now permanently VIP at this business." This mirrors the same open question Variant B of the business-proximity doc raised about qualifying windows.
- **Redemption flow UX**: today's `partner_offer_codes` claim flow assumes points-based offers show up in a general browse/redeem screen. An event-offer instead probably surfaces *inside* the event itself — e.g. on the cleanup event's post-completion screen ("Nearby thank-you: Hart Kitchen is offering attendees today's cleanup a free coffee — claim below") rather than mixed into the general points-redeemable offer list. This needs a UI decision, not just a backend eligibility check.

**What's new and not yet designed:**
- Who creates an event-offer — the business (self-serve, needs `partner_business_admins` login, which already exists per `033_partner_business_admins.sql`) or an admin on the business's behalf after the organizer's outreach (piece 2) leads to an informal agreement? Recommend admin-created for v1, since piece 2 is explicitly an informal-outreach tool — self-serve partner creation of event-offers is a natural v2 once there's a pattern of repeat use.
- Does the group organizer need to *request* the offer be created (i.e., they email the business per piece 2, business agrees, then someone — admin or business — creates the offer in-system), or can a business proactively list "I'll always offer X to any group that cleans up nearby" without a specific ask? The latter is close to Variant B of the business-proximity bonus doc (proximity-gated offer) rather than group-gated — worth deciding whether these should actually be the same underlying mechanism (proximity-to-location vs. specific-group-relationship) rather than two separate offer shapes with overlapping intent. **This is the single biggest open design question** — recommend resolving it before writing any migration, since it changes whether `event_group_id` or a proximity radius is the right eligibility key.

**Rough size:** medium — schema change (new mode + column + constraint), an eligibility-check query reusing existing `attended_user_ids` data, and a redemption-surface UI decision (in-event vs. general offer list). No new domain entity needed since it rides on existing `cleanups` and `partner_offers`.

## Open questions

1. **Group-scoped vs. proximity-scoped eligibility** — does "attend this group's event" gate the offer, or "clean up near this business" (which would make this the same feature as Variant B in `[[business-proximity-cleanup-bonus-scoping-2026-08-14]]`)? These read as similar in practice (a group's cleanup event has a location) but are different eligibility keys with different edge cases (a group cleaning up far from the partner but still wanting to redeem the "we handshake-agreed on this" offer vs. any group/individual happening to clean up nearby with no relationship at all). Recommend deciding whether this is one unified "proximity-or-relationship-gated offer" feature or genuinely two.
2. **Self-serve vs. admin-created event-offers** — affects whether `partner_business_admins` needs new UI, or this stays an admin-manual process for now.
3. **Contact email on `partner_businesses`** — does the nearby-business card need a dedicated email field, or is there already a designated contact via `partner_business_admins` that can be surfaced instead?
4. **Redemption window** — how long after an event does attendance keep qualifying for an event-offer?
5. **Redemption surface** — inside the event's own screen, or folded into the existing points-redeemable offer browse list with a different badge/filter?

## Suggested build order

1. Piece 2 (nearby-business suggestion panel) first — small, no schema risk, immediately useful as a partner lead-gen tool even with zero offers ever formalized.
2. Resolve open question 1 (group-scoped vs. proximity-scoped) before touching `partner_offers` schema, since it determines whether this shares a migration with `[[business-proximity-cleanup-bonus-scoping-2026-08-14]]`'s Variant B or is a separate `event` redemption mode.
3. Piece 1, admin-created only, group-scoped (unless question 1 resolves toward proximity), reusing `attended_user_ids` for eligibility — no new attendance tracking needed.
