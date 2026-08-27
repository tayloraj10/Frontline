-- Moves the "how many times can this offer be redeemed at one event" decision from
-- the organizer (previously set per attachment on cleanup_event_offers.max_redemptions)
-- to the business, since it's really a property of the offer itself, not something an
-- organizer should be guessing at when attaching it to an event.
--
-- cleanup_event_offers.max_redemptions is kept as-is; it's now populated automatically
-- from partner_offers.event_redemption_limit at attach time instead of being typed in
-- by the organizer, so existing enforcement logic in the redeem endpoint is unaffected.

ALTER TABLE partner_offers ADD COLUMN event_redemption_limit integer CHECK (event_redemption_limit IS NULL OR event_redemption_limit > 0);
