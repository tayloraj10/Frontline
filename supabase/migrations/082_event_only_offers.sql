-- Lets a business create an offer that's redeemable ONLY via event check-in, with no
-- points-based path at all -- so they don't have to make up a points_cost/points_threshold
-- for an offer they never intend anyone to redeem outside of an attached cleanup event.
--
-- Adds redemption_mode = 'event_only': points_cost and points_threshold are both NULL,
-- and event_eligible must be true (enforced below) since an event_only offer with no
-- attached event would otherwise be unredeemable by anyone. The redeem_offer endpoint
-- must reject any non-event redemption attempt for this mode.

ALTER TABLE partner_offers DROP CONSTRAINT partner_offers_redemption_mode_check;
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_redemption_mode_check
  CHECK (redemption_mode IN ('spend', 'threshold', 'event_only'));

ALTER TABLE partner_offers DROP CONSTRAINT partner_offers_mode_field;
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_mode_field CHECK (
  (redemption_mode = 'spend' AND points_cost IS NOT NULL) OR
  (redemption_mode = 'threshold' AND points_threshold IS NOT NULL) OR
  (redemption_mode = 'event_only' AND points_cost IS NULL AND points_threshold IS NULL AND event_eligible)
);
