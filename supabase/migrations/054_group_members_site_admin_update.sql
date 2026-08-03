-- Site admins can now leave a group they admin (GroupMembershipButton's leave
-- flow has no role restriction, and a group doesn't require an admin -- see
-- app-capability-doc.md). That can leave a group with zero admins, at which
-- point group_members_update (040_group_members_update_policy.sql) blocks
-- everyone from promoting a new one, since it only allows an *existing* group
-- admin to change roles. A site admin visiting /groups/[slug]/edit (already
-- permitted in for admin-less groups by the edit page's isSiteAdmin check)
-- would hit a silently-ignored RLS update with no rows affected. Mirrors
-- group_members_insert_site_admin's reasoning (047_group_applications.sql).
CREATE POLICY "group_members_update_site_admin" ON group_members
  FOR UPDATE USING (is_site_admin());
