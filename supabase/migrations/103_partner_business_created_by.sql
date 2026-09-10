-- Business self-submission (partners/apply) previously allowed a fully
-- unauthenticated insert with no way to know who submitted a business, so
-- there was no account to later assign as its business admin. The frontend
-- now requires sign-in before a pending business (or its locations) can be
-- inserted, and records who submitted it.

ALTER TABLE partner_businesses
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Replaces the fully-open 029_partner_business_pending.sql policy: a pending
-- business must now be attributed to the authenticated submitter.
DROP POLICY "partner_businesses_insert_pending" ON partner_businesses;
CREATE POLICY "partner_businesses_insert_pending" ON partner_businesses
  FOR INSERT WITH CHECK (status = 'pending' AND auth.uid() = created_by);

-- Mirrors the tightened business policy above: a pending business's
-- locations may only be inserted by that business's own submitter (not by
-- any authenticated user who happens to know the business id).
DROP POLICY "partner_business_locations_insert_pending" ON partner_business_locations;
CREATE POLICY "partner_business_locations_insert_pending" ON partner_business_locations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.status = 'pending' AND b.created_by = auth.uid()
    )
  );
