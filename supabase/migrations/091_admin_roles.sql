-- Scoped admin roles: additive layer on top of profiles.is_admin / is_site_admin(),
-- which stay untouched (load-bearing in existing RLS policies). A super admin
-- (is_admin = true) implicitly holds every scoped role; admin_roles grants a role to
-- someone who is NOT a full site admin. Multi-selectable: one user can hold several
-- rows (one per role).

CREATE TABLE admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('group_approver', 'business_approver', 'event_manager')),
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE INDEX admin_roles_user_id_idx ON admin_roles(user_id);

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

-- Managing roles stays super-admin-only for now (granting an event_manager role is
-- itself a site-admin-level action) — a role holder never manages other roles.
CREATE POLICY "admin_roles_select" ON admin_roles
  FOR SELECT USING (is_site_admin());

CREATE POLICY "admin_roles_insert" ON admin_roles
  FOR INSERT WITH CHECK (is_site_admin());

CREATE POLICY "admin_roles_delete" ON admin_roles
  FOR DELETE USING (is_site_admin());
