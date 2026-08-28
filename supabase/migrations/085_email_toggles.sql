-- Killswitches for the three cleanup-event email pathways built on top of
-- send_email()/emails_sent (084). Each is a boolean-as-numeric (0/1) row in
-- game_settings so the existing admin settings UI/RLS/update flow can be reused
-- as-is rather than inventing a parallel settings table. All default OFF (0) --
-- the user wants to review behavior before any of these start actually sending.

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('email_partner_coordination_enabled', 0, 'email_toggles', 'Partner coordination emails', 'When an organizer attaches a partner offer to a group event, email the business admins (CC organizer) to coordinate details.'),
  ('email_attendee_reminder_enabled', 0, 'email_toggles', 'Attendee reminder emails', 'Allows an event organizer to manually send a reminder email to everyone RSVP''d "going" for their event.'),
  ('email_organizer_stats_reminder_enabled', 0, 'email_toggles', 'Organizer stats reminder emails', 'Automated reminder emailed to event organizers ~1 day before / day of their event, including current RSVP stats.');

-- Tracks whether the automated day-before/day-of organizer reminder has already
-- gone out for a given event, so the cron job never double-sends.
ALTER TABLE cleanups ADD COLUMN organizer_reminder_sent_at timestamptz;
