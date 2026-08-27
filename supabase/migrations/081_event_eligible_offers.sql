-- Event-redeemable offers (event-redeemable-offers-and-nearby-business-suggestions
-- scoping doc, Piece 1). Model: `event_eligible` is an orthogonal flag on
-- partner_offers, not a new redemption_mode -- a spend/threshold offer can also be
-- marked event_eligible so the same offer works both ways. The actual eligibility
-- gate is created per-event: an organizer picks an event_eligible offer from a nearby
-- partner while creating their cleanup (via the nearby-partners panel), which inserts
-- a row into cleanup_event_offers linking that specific offer to that specific event.
-- An attendee of that event who checked in is then eligible to redeem the offer for
-- free (no points check) within a short window after the event, handled by the
-- redemption endpoint -- this migration only adds the schema.

ALTER TABLE partner_offers ADD COLUMN event_eligible boolean NOT NULL DEFAULT false;

CREATE TABLE cleanup_event_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_id uuid NOT NULL REFERENCES cleanups(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  added_by uuid REFERENCES profiles(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cleanup_id, offer_id)
);

CREATE INDEX idx_cleanup_event_offers_cleanup ON cleanup_event_offers (cleanup_id);
CREATE INDEX idx_cleanup_event_offers_offer ON cleanup_event_offers (offer_id);

ALTER TABLE cleanup_event_offers ENABLE ROW LEVEL SECURITY;

-- Publicly visible (same spirit as partner_offers_select) so any attendee/viewer of
-- the event can see which offers are attached to it.
CREATE POLICY "cleanup_event_offers_select" ON cleanup_event_offers
  FOR SELECT USING (true);

-- Only the hosting group's admins can attach/detach an offer to their own event.
-- Mirrors the is_group_admin() pattern used for cleanup_event_cohosts (045).
CREATE POLICY "cleanup_event_offers_insert" ON cleanup_event_offers
  FOR INSERT WITH CHECK (
    is_group_admin((SELECT group_id FROM cleanups WHERE id = cleanup_id))
  );
CREATE POLICY "cleanup_event_offers_delete" ON cleanup_event_offers
  FOR DELETE USING (
    is_group_admin((SELECT group_id FROM cleanups WHERE id = cleanup_id))
  );
