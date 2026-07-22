-- group_members had no UPDATE policy, so RLS silently blocked every
-- promote/demote call from MemberManager.tsx (Postgres RLS defaults to deny
-- when no policy exists for a command). Only group admins may change a
-- member's role.

CREATE POLICY "group_members_update" ON group_members FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  )
);
