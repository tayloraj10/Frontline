-- Lets an organizer cap how many times an event-attached offer can be redeemed for
-- that specific cleanup event (e.g. "only the first 20 attendees get the free coffee"),
-- while defaulting to unlimited so existing/typical attachments are unaffected.
--
-- The cap lives on cleanup_event_offers (per event-attachment), not on partner_offers
-- itself, since the same offer can be attached to multiple events with different caps.
-- Enforcing it requires knowing which event a given redemption came through, so
-- partner_redemptions also gains a nullable cleanup_id, populated only for event
-- redemptions (points-based redemptions have no associated event).

ALTER TABLE cleanup_event_offers ADD COLUMN max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0);

ALTER TABLE partner_redemptions ADD COLUMN cleanup_id uuid REFERENCES cleanups(id) ON DELETE SET NULL;

CREATE INDEX idx_partner_redemptions_offer_cleanup ON partner_redemptions (offer_id, cleanup_id);
