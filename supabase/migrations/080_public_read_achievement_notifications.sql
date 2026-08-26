-- Achievements on a user's profile page are now shown to all viewers, not just the
-- profile owner. user_notifications previously only allowed a user to read their own
-- rows, so this adds a narrow public-read policy scoped to the achievement types
-- actually rendered publicly (milestone, offer_eligible). All other notification
-- types (event, tract_claimed, etc.) remain owner-only via the existing policy.
CREATE POLICY "public_read_achievement_notifications" ON user_notifications
  FOR SELECT USING (type IN ('milestone', 'offer_eligible'));
