-- Idempotency for the post-event follow-up email (mirrors organizer_reminder_sent_at).
ALTER TABLE cleanups ADD COLUMN organizer_followup_sent_at timestamptz;

-- Killswitch, same pattern/category as email_organizer_stats_reminder_enabled.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('email_organizer_followup_enabled', 0, 'notifications', 'Organizer post-event follow-up emails',
   'Automated email to event organizers after an event''s check-in window closes: stats summary, or a nudge to log metrics if none were recorded.');

-- Generic link target for notifications beyond campaign_slug.
ALTER TABLE user_notifications ADD COLUMN link_url text;
