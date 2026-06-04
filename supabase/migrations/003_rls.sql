-- Row Level Security policies

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE territory_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_reports ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, only owner can update
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Groups: anyone can read, only creator or admin can update
CREATE POLICY "groups_select" ON groups FOR SELECT USING (true);
CREATE POLICY "groups_insert" ON groups FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "groups_update" ON groups FOR UPDATE USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin'
  )
);

-- Group members: anyone can read, auth users can join, admins can manage
CREATE POLICY "group_members_select" ON group_members FOR SELECT USING (true);
CREATE POLICY "group_members_insert" ON group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_members_delete" ON group_members FOR DELETE USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  )
);

-- Contributions: anyone can read, auth users can insert their own
CREATE POLICY "contributions_select" ON contributions FOR SELECT USING (true);
CREATE POLICY "contributions_insert" ON contributions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Territory claims: public read
CREATE POLICY "territory_claims_select" ON territory_claims FOR SELECT USING (true);

-- Leaderboard: public read
CREATE POLICY "leaderboard_select" ON leaderboard_entries FOR SELECT USING (true);

-- Campaign events: public read
CREATE POLICY "campaign_events_select" ON campaign_events FOR SELECT USING (true);

-- Problem reports: auth users can insert and read
CREATE POLICY "problem_reports_select" ON problem_reports FOR SELECT USING (true);
CREATE POLICY "problem_reports_insert" ON problem_reports FOR INSERT WITH CHECK (auth.uid() = reported_by);
