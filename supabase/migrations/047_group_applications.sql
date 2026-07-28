-- Group applications: replace direct group creation with an admin-reviewed
-- application flow (mirrors the partner_businesses pending pattern in
-- 029_partner_business_pending.sql). Users self-submit a group as
-- status='pending'; it's invisible to everyone except the applicant and site
-- admins until an admin approves it (flips to 'approved') or rejects it
-- (flips to 'rejected' -- kept as a record rather than deleted, matching the
-- partner_businesses change below).

ALTER TABLE groups
  ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected'));

-- A group's status may only ever change via a site admin (review happens in
-- the admin panel). Without this, the existing groups_update policy
-- (creator OR group-admin can update) would let an applicant simply set
-- their own pending group to 'approved' and skip review entirely.
CREATE OR REPLACE FUNCTION protect_group_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT is_site_admin() THEN
    RAISE EXCEPTION 'Only a site admin can change a group''s status.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER groups_protect_status
  BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION protect_group_status();

-- Widen insert to let a user submit their own group as 'pending' (the
-- previous policy allowed auth.uid() = created_by with no status
-- restriction, i.e. immediate live creation). Site admins are unrestricted,
-- same as before.
DROP POLICY "groups_insert" ON groups;
CREATE POLICY "groups_insert" ON groups
  FOR INSERT WITH CHECK (
    (auth.uid() = created_by AND status = 'pending') OR is_site_admin()
  );

-- Hide pending/rejected groups from everyone except their applicant and site
-- admins (previous policy was USING (true) -- fully public).
DROP POLICY "groups_select" ON groups;
CREATE POLICY "groups_select" ON groups
  FOR SELECT USING (
    status = 'approved' OR auth.uid() = created_by OR is_site_admin()
  );

-- Site admins can now update any group directly from the admin panel
-- (previously groups_update only covered the creator or an existing group
-- admin -- neither of which exist yet for a pending application).
CREATE POLICY "groups_update_site_admin" ON groups
  FOR UPDATE USING (is_site_admin());

-- Approving a group grants its applicant admin membership. The old flow had
-- the client insert this itself immediately after creating the group; that
-- no longer happens until a site admin approves, so admins need to be able
-- to insert group_members on someone else's behalf.
CREATE POLICY "group_members_insert_site_admin" ON group_members
  FOR INSERT WITH CHECK (is_site_admin());

-- Match groups' reject-and-keep-a-record behavior on partner business
-- applications (previously rejecting a partner business deleted it outright
-- with no record).
ALTER TABLE partner_businesses
  DROP CONSTRAINT partner_businesses_status_check,
  ADD CONSTRAINT partner_businesses_status_check CHECK (status IN ('active', 'inactive', 'pending', 'rejected'));
