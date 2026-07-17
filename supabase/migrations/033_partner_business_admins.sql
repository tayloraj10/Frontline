-- Lets a partner business self-manage its own listing/offers instead of requiring a
-- site admin to do it. A business can have multiple admins (staff), and a user can
-- administer multiple businesses, hence a join table rather than a single owner column.
--
-- is_business_admin() mirrors is_site_admin() (008_admin_role.sql) so it can be used
-- the same way inside RLS policies. The new business-admin policies are added
-- alongside the existing is_site_admin()-only ones (Postgres ORs permissive policies
-- for the same command together), so nothing already granted to site admins changes.

CREATE TABLE partner_business_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES partner_businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);

ALTER TABLE partner_business_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_business_admin(target_business_id uuid)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM partner_business_admins
    WHERE business_id = target_business_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "partner_business_admins_select" ON partner_business_admins
  FOR SELECT USING (user_id = auth.uid() OR is_site_admin());
CREATE POLICY "partner_business_admins_insert" ON partner_business_admins
  FOR INSERT WITH CHECK (is_site_admin());
CREATE POLICY "partner_business_admins_update" ON partner_business_admins
  FOR UPDATE USING (is_site_admin());
CREATE POLICY "partner_business_admins_delete" ON partner_business_admins
  FOR DELETE USING (is_site_admin());

-- Additive: a business admin can update their own business (not insert/delete —
-- creation/removal of a business stays a site-admin-only action) and manage that
-- business's offers. Existing is_site_admin() policies on these tables are untouched.
CREATE POLICY "partner_businesses_update_business_admin" ON partner_businesses
  FOR UPDATE USING (is_business_admin(id));

CREATE POLICY "partner_offers_insert_business_admin" ON partner_offers
  FOR INSERT WITH CHECK (is_business_admin(business_id));
CREATE POLICY "partner_offers_update_business_admin" ON partner_offers
  FOR UPDATE USING (is_business_admin(business_id));

-- Lets a business admin see their own business's redemption history (e.g. for a
-- future "how many people redeemed this" view), same shape as the existing
-- user_id = auth.uid() self-view policy.
CREATE POLICY "partner_redemptions_select_business_admin" ON partner_redemptions
  FOR SELECT USING (is_business_admin(business_id));
