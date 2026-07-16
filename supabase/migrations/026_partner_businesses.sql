-- Partner businesses offering discounts/perks redeemable with points. Schema is
-- deliberately flexible on two axes:
--   redemption_mode = 'spend'      -> offer costs points_cost, redeeming deducts it
--   redemption_mode = 'threshold'  -> offer just requires points_threshold to unlock,
--                                     redeeming does not deduct anything
-- Fulfillment is a pool of unique single-use codes per offer (partner_offer_codes),
-- claimed one-per-redemption via partner_redemptions. profiles.points is already an
-- incremental running total (see 024_user_points.sql), so a future redemption
-- endpoint can safely decrement it the same way contribution/report triggers add to
-- it, with no resync needed.
--
-- This migration only adds the schema + admin-manageable tables. The user-facing
-- browse/redeem flow (and the endpoint that atomically checks balance, decrements
-- points, and claims a code) is a separate future task.

CREATE TABLE partner_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_url text,
  website_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE partner_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES partner_businesses(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  redemption_mode text NOT NULL CHECK (redemption_mode IN ('spend', 'threshold')),
  points_cost numeric CHECK (points_cost IS NULL OR points_cost >= 0),
  points_threshold numeric CHECK (points_threshold IS NULL OR points_threshold >= 0),
  max_redemptions_per_user integer CHECK (max_redemptions_per_user IS NULL OR max_redemptions_per_user > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'expired')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_offers_mode_field CHECK (
    (redemption_mode = 'spend' AND points_cost IS NOT NULL) OR
    (redemption_mode = 'threshold' AND points_threshold IS NOT NULL)
  )
);

CREATE INDEX idx_partner_offers_business ON partner_offers (business_id);

CREATE TABLE partner_offer_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES partner_offers(id) ON DELETE CASCADE,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed')),
  claimed_by uuid REFERENCES profiles(id),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, code)
);

CREATE INDEX idx_partner_offer_codes_offer_status ON partner_offer_codes (offer_id, status);

CREATE TABLE partner_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  offer_id uuid NOT NULL REFERENCES partner_offers(id),
  business_id uuid NOT NULL REFERENCES partner_businesses(id),
  code_id uuid NOT NULL UNIQUE REFERENCES partner_offer_codes(id),
  points_spent numeric NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_redemptions_user ON partner_redemptions (user_id);
CREATE INDEX idx_partner_redemptions_offer ON partner_redemptions (offer_id);

ALTER TABLE partner_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_offer_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_redemptions ENABLE ROW LEVEL SECURITY;

-- Businesses/offers: publicly visible when active, admin sees everything and manages via direct insert/update/delete
CREATE POLICY "partner_businesses_select" ON partner_businesses
  FOR SELECT USING (status = 'active' OR is_site_admin());
CREATE POLICY "partner_businesses_insert" ON partner_businesses
  FOR INSERT WITH CHECK (is_site_admin());
CREATE POLICY "partner_businesses_update" ON partner_businesses
  FOR UPDATE USING (is_site_admin());
CREATE POLICY "partner_businesses_delete" ON partner_businesses
  FOR DELETE USING (is_site_admin());

CREATE POLICY "partner_offers_select" ON partner_offers
  FOR SELECT USING (status != 'expired' OR is_site_admin());
CREATE POLICY "partner_offers_insert" ON partner_offers
  FOR INSERT WITH CHECK (is_site_admin());
CREATE POLICY "partner_offers_update" ON partner_offers
  FOR UPDATE USING (is_site_admin());
CREATE POLICY "partner_offers_delete" ON partner_offers
  FOR DELETE USING (is_site_admin());

-- Codes are never publicly readable (they're the redeemable secret) — admin-only for now.
-- The future redemption endpoint runs as the backend service role, which bypasses RLS.
CREATE POLICY "partner_offer_codes_select" ON partner_offer_codes
  FOR SELECT USING (is_site_admin());
CREATE POLICY "partner_offer_codes_insert" ON partner_offer_codes
  FOR INSERT WITH CHECK (is_site_admin());
CREATE POLICY "partner_offer_codes_update" ON partner_offer_codes
  FOR UPDATE USING (is_site_admin());
CREATE POLICY "partner_offer_codes_delete" ON partner_offer_codes
  FOR DELETE USING (is_site_admin());

-- Redemptions: users can see their own history, admin sees all. No client-side insert
-- policy yet — writing a redemption requires atomically checking balance, decrementing
-- points, and claiming a code, which belongs in a backend endpoint, not a direct insert.
CREATE POLICY "partner_redemptions_select" ON partner_redemptions
  FOR SELECT USING (user_id = auth.uid() OR is_site_admin());
