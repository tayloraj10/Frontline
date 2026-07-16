-- Public "apply to join" flow: a business can self-submit a listing from an
-- unauthenticated route, but it starts as 'pending' and is invisible to
-- everyone except admins (existing partner_businesses_select policy only
-- shows status = 'active' to non-admins) until an admin reviews it, assigns
-- campaigns, and flips it to 'active'.
--
-- The existing admin-only insert policy (partner_businesses_insert) is left
-- untouched. Postgres ORs multiple permissive policies for the same command
-- together, so this new policy only ever widens who can insert, and only for
-- rows created as 'pending'.

ALTER TABLE partner_businesses
  DROP CONSTRAINT partner_businesses_status_check,
  ADD CONSTRAINT partner_businesses_status_check CHECK (status IN ('active', 'inactive', 'pending'));

CREATE POLICY "partner_businesses_insert_pending" ON partner_businesses
  FOR INSERT WITH CHECK (status = 'pending');
