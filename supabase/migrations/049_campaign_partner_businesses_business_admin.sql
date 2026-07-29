-- Business admins can link/unlink their own business to campaigns from the
-- partner dashboard (PartnerDashboardClient.tsx), but campaign_partner_businesses
-- only had is_site_admin()-gated insert/delete policies (028_partner_business_location.sql),
-- so those calls were rejected by RLS for non-site-admin business admins.
-- Additive, mirrors the is_business_admin() pattern from 033_partner_business_admins.sql.

CREATE POLICY "campaign_partner_businesses_insert_business_admin" ON campaign_partner_businesses
  FOR INSERT WITH CHECK (is_business_admin(business_id));
CREATE POLICY "campaign_partner_businesses_delete_business_admin" ON campaign_partner_businesses
  FOR DELETE USING (is_business_admin(business_id));
