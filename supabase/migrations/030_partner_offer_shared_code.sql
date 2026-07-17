-- Replaces the partner_offer_codes pool model with a single shared code per offer plus an
-- optional total-redemption cap. The pool required an admin to keep pasting in unique codes
-- one-per-line, which doesn't scale for an ongoing promo; offers already enforce
-- max_redemptions_per_user, so all the pool bought beyond that was an optional supply limit,
-- which max_total_redemptions models directly. partner_offer_codes and partner_redemptions.code_id
-- are left in place untouched (any historical rows are preserved) — the new redemption path just
-- stops writing to them.

ALTER TABLE partner_offers ADD COLUMN code text;
ALTER TABLE partner_offers ADD COLUMN max_total_redemptions integer
  CHECK (max_total_redemptions IS NULL OR max_total_redemptions > 0);

ALTER TABLE partner_offers DROP CONSTRAINT partner_offers_status_check;
ALTER TABLE partner_offers ADD CONSTRAINT partner_offers_status_check
  CHECK (status IN ('active', 'paused', 'expired', 'cancelled'));

DROP POLICY "partner_offers_select" ON partner_offers;
CREATE POLICY "partner_offers_select" ON partner_offers
  FOR SELECT USING (status NOT IN ('expired', 'cancelled') OR is_site_admin());

ALTER TABLE partner_redemptions ADD COLUMN code text;
ALTER TABLE partner_redemptions ALTER COLUMN code_id DROP NOT NULL;
