-- Consolidates what were originally 4 separate migrations (grace window, late-submission
-- setting, value tuning, civic_action_value removal) into one, since none of these were
-- deployed to prod yet. Final state only — skips intermediate values that were immediately
-- overwritten by a later migration in the original sequence (e.g. late-submission cutoff
-- was inserted as 24 then changed to 2; this file inserts 2 directly).

-- Check-in grace window for group cleanup events (previously hardcoded as
-- CLEANUP_EVENT_GRACE_MINUTES_BEFORE/_AFTER in backend/app/api/routes/cleanup_events.py, and
-- mirrored as a duplicate literal in frontend/src/app/campaigns/[slug]/CampaignPageClient.tsx).
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('cleanup_event_grace_minutes_before', 30, 'claim_timing', 'Check-in grace period - before (minutes)', 'How early a group cleanup event''s check-in window opens relative to its scheduled start.'),
  ('cleanup_event_grace_minutes_after', 120, 'claim_timing', 'Check-in grace period - after (minutes)', 'How long a group cleanup event''s check-in window stays open after its scheduled end (or start, if no end is set).');

-- Late-submission cutoff (previously hardcoded as a 24h timedelta in get_cleanup_event).
-- Only affects the "late" flag shown to organizers for visibility; never blocks a submission,
-- so a tight window is fine.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('cleanup_event_late_submission_hours', 2, 'claim_timing', 'Late submission cutoff (hours)', 'How long after a group cleanup event''s window closes a submission still counts as "on time" rather than flagged late.');

-- Balance tuning: hotspot multiplier bumped to 2x (was 1x, i.e. no bonus at all), and
-- trash_report_value dropped to 0.5 (was 1) so reporting trash is worth less than
-- actually cleaning up a small bag of it (small_bag_value = 1).
UPDATE game_settings SET value = 2, updated_at = now() WHERE key = 'hotspot_multiplier';
UPDATE game_settings SET value = 0.5, updated_at = now() WHERE key = 'trash_report_value';

-- civic_action_value: removed. It's only consumed as a fallback point value for
-- non-cleanup contribution types (contribution_scoring.py, contributions.py), and the
-- only campaign using contribution_type civic_action ("Road to Independence") is still
-- draft and may never ship. The code already falls back to a hardcoded default (1) when
-- this row is absent, so deleting it is safe and reversible — re-insert if/when that
-- campaign goes live.
DELETE FROM game_settings WHERE key = 'civic_action_value';
