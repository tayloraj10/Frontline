-- Lets a pending business's own creator fully manage it (edit info, locations, offers,
-- campaign links) before an admin has approved it and granted partner_business_admins
-- access. Previously only partner_businesses_select_own (104) let them read the row --
-- editing it required is_business_admin(), which nothing grants until approval, so the
-- Partner Dashboard could only ever show a pending business read-only.
--
-- Every policy here is scoped to status = 'pending' specifically: once a business goes
-- active, its creator loses this path and falls back to being a normal business admin
-- (or not, if the admin didn't grant that on approval) -- this is a bootstrapping
-- allowance for the review-pending window only, not a permanent ownership right.

CREATE POLICY "partner_businesses_update_own_pending" ON partner_businesses
  FOR UPDATE USING (auth.uid() = created_by AND status = 'pending');

CREATE POLICY "partner_business_locations_update_own_pending" ON partner_business_locations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.created_by = auth.uid() AND b.status = 'pending'
    )
  );
CREATE POLICY "partner_business_locations_delete_own_pending" ON partner_business_locations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.created_by = auth.uid() AND b.status = 'pending'
    )
  );

CREATE POLICY "partner_offers_insert_own_pending" ON partner_offers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.created_by = auth.uid() AND b.status = 'pending'
    )
  );
CREATE POLICY "partner_offers_update_own_pending" ON partner_offers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.created_by = auth.uid() AND b.status = 'pending'
    )
  );

CREATE POLICY "campaign_partner_businesses_insert_own_pending" ON campaign_partner_businesses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.created_by = auth.uid() AND b.status = 'pending'
    )
  );
CREATE POLICY "campaign_partner_businesses_delete_own_pending" ON campaign_partner_businesses
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.created_by = auth.uid() AND b.status = 'pending'
    )
  );
