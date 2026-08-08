-- user_notifications was never added to the supabase_realtime publication when it was
-- introduced, so the frontend's postgres_changes INSERT subscriptions (NotificationBell.tsx,
-- AchievementModal.tsx) never fire for any notification, in-app or push-preceding.
ALTER PUBLICATION supabase_realtime ADD TABLE user_notifications;
