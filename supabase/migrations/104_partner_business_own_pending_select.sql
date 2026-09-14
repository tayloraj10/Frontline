-- Lets a business's own submitter see it on their Partner Dashboard while it's still
-- pending admin review. Right now partner_businesses_select only shows status = 'active'
-- rows to non-admins, so a business a user just submitted via /partners/apply is
-- completely invisible to them (no partner_business_admins row exists yet either --
-- that's only created on admin approval). Postgres ORs multiple permissive policies
-- together for the same command, so this only ever widens visibility: a creator can
-- now also read back their own row regardless of status, on top of the existing
-- "active OR site admin" policy.

CREATE POLICY "partner_businesses_select_own" ON partner_businesses
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "partner_business_locations_select_own" ON partner_business_locations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.created_by = auth.uid()
    )
  );
