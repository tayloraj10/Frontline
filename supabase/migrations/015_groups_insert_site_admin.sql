-- Allow site admins to create groups on behalf of others (e.g. during onboarding).
-- The original groups_insert policy only permitted the creating user (auth.uid() = created_by).

DROP POLICY "groups_insert" ON groups;

CREATE POLICY "groups_insert" ON groups
  FOR INSERT WITH CHECK (
    auth.uid() = created_by OR is_site_admin()
  );
