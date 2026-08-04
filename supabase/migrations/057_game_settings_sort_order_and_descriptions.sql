-- Consolidates what were originally 3 separate migrations (sort_order column + initial
-- ordering, a trigger-category reorder, and description clarifications) into one, since none
-- of these were deployed to prod yet. Final sort_order values only (the trigger-defaults
-- category was reordered once after its initial pass; this file writes the final order
-- directly instead of writing it twice).
--
-- Rows were previously displayed in whatever order Postgres happened to return them within a
-- category (no ORDER BY on key), which drifted after in-place UPDATEs and no longer matched
-- the logical grouping admins expect (e.g. the three claim-cleanup-window severity tiers
-- scattered, check-in grace "after" shown before "before"). sort_order makes display order
-- explicit and admin-controllable independent of insertion order.

ALTER TABLE game_settings ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE game_settings SET sort_order = v.sort_order FROM (VALUES
  ('claim_before_window_minutes', 10),
  ('claim_after_window_minutes_low', 11),
  ('claim_after_window_minutes_medium', 12),
  ('claim_after_window_minutes_high', 13),
  ('claim_reclaim_cooldown_minutes', 14),
  ('cleanup_event_grace_minutes_before', 15),
  ('cleanup_event_grace_minutes_after', 16),
  ('cleanup_event_late_submission_hours', 17),

  ('flag_auto_hide_threshold', 20),

  ('claim_challenge_multiplier', 30),
  ('hotspot_multiplier', 31),

  ('small_bag_value', 40),
  ('large_bag_value', 41),
  ('pound_value', 42),
  ('trash_report_value', 43),
  ('trash_war_solarpunk_credit', 45),

  ('claim_proximity_meters_uk', 50),
  ('claim_proximity_meters_us', 51),
  ('cleanup_event_proximity_meters', 52),
  ('hotspot_proximity_meters_uk', 53),
  ('hotspot_proximity_meters_us', 54),

  ('report_count_threshold_default', 60),
  ('hotspot_event_duration_hours', 61),
  ('threshold_reached_default', 62),
  ('threshold_reached_event_duration_hours', 63),
  ('time_elapsed_default_hours', 64),
  ('time_elapsed_event_duration_hours_default', 65)
) AS v(key, sort_order)
WHERE game_settings.key = v.key;

-- Description clarifications, grouped here since they were bundled with the reorder work.
UPDATE game_settings SET description = 'Only used when an admin creates an automated event trigger (Manage Triggers) of type "time elapsed" WITHOUT setting its own hours in that trigger''s config. Controls how many hours after campaign creation the trigger fires. Has no effect on triggers that already specify their own hours.'
  WHERE key = 'time_elapsed_default_hours';

UPDATE game_settings SET description = 'Only used when an admin creates a "time elapsed" event trigger WITHOUT setting its own event duration in that trigger''s config. Controls how many hours the campaign event that trigger creates stays active before auto-ending. Has no effect on triggers that already specify their own duration.'
  WHERE key = 'time_elapsed_event_duration_hours_default';

UPDATE game_settings SET description = 'Only used when an admin creates a "score threshold" event trigger WITHOUT setting its own threshold in that trigger''s config. Controls the score a campaign must reach for the trigger to fire. Has no effect on triggers that already specify their own threshold.'
  WHERE key = 'threshold_reached_default';

UPDATE game_settings SET description = 'Only used when an admin creates a "score threshold" event trigger WITHOUT setting its own event duration in that trigger''s config. Controls how many hours the campaign event that trigger creates stays active before auto-ending. Has no effect on triggers that already specify their own duration.'
  WHERE key = 'threshold_reached_event_duration_hours';

UPDATE game_settings SET description = 'Applied only when a Trash War cleanup is submitted after starting from the Solarpunk redirect (i.e. the user tapped through from Solarpunk to report/clean trash), and only for an individually-logged cleanup — not group/team-total event logs or claimed-report challenges. Credits the Solarpunk hex''s bloom score (territory_claims.total_value); contributes 0 to the user''s own lifetime/spendable points since those already come from the Trash War cleanup itself.'
  WHERE key = 'trash_war_solarpunk_credit';
