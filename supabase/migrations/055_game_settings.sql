-- Admin-editable game-balance settings: centralizes scoring/game-config knobs that were
-- previously hardcoded Python module constants (or, for trash_report_value, an implicit
-- literal in a Postgres trigger) scattered across the backend.

CREATE TABLE game_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

ALTER TABLE game_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_settings_select" ON game_settings
  FOR SELECT USING (true);

CREATE POLICY "game_settings_update" ON game_settings
  FOR UPDATE USING (is_site_admin());

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('small_bag_value', 1, 'points', 'Small bag value', 'Points awarded per small trash bag logged on a cleanup.'),
  ('large_bag_value', 3, 'points', 'Large bag value', 'Points awarded per large trash bag logged on a cleanup.'),
  ('pound_value', 0.5, 'points', 'Pound of trash value', 'Points awarded per pound of trash logged on a cleanup.'),
  ('trash_report_value', 1, 'points', 'Trash report value', 'Points awarded to a user for submitting a problem report.'),
  ('civic_action_value', 1, 'points', 'Civic action value', 'Flat point value for non-cleanup contributions (civic actions, Solarpunk photo actions) when no explicit value is supplied.'),
  ('trash_war_solarpunk_credit', 8, 'points', 'Trash War -> Solarpunk credit', 'Flat point credit awarded to the linked Solarpunk campaign whenever a Trash War cleanup is logged.'),
  ('claim_challenge_multiplier', 1.5, 'multipliers', 'Claim challenge multiplier', 'Score multiplier applied to the resulting cleanup contribution when a claimed problem report is resolved via challenge mode.'),
  ('hotspot_multiplier', 1, 'multipliers', 'Hotspot multiplier', 'Default score multiplier for an active campaign event whose effect_config does not specify its own multiplier (e.g. a triggered Trash Hotspot event).'),
  ('claim_before_window_minutes', 30, 'claim_timing', 'Claim before-photo window (minutes)', 'How long a claimant has to submit the "before" photo after claiming a report.'),
  ('claim_after_window_minutes_low', 20, 'claim_timing', 'Claim cleanup window - low severity (minutes)', 'Cleanup window length for low-severity claimed reports.'),
  ('claim_after_window_minutes_medium', 30, 'claim_timing', 'Claim cleanup window - medium severity (minutes)', 'Cleanup window length for medium-severity claimed reports.'),
  ('claim_after_window_minutes_high', 45, 'claim_timing', 'Claim cleanup window - high severity (minutes)', 'Cleanup window length for high-severity claimed reports.'),
  ('claim_reclaim_cooldown_minutes', 15, 'claim_timing', 'Reclaim cooldown (minutes)', 'Cooldown before the same user can reclaim a report they released or expired out of.'),
  ('claim_proximity_meters_uk', 100, 'proximity', 'Claim proximity - UK (meters)', 'Max distance to submit a claim before/after photo for UK postcode-district campaigns.'),
  ('claim_proximity_meters_us', 91.44, 'proximity', 'Claim proximity - US (meters)', 'Max distance to submit a claim before/after photo for non-UK campaigns (300 ft).'),
  ('hotspot_proximity_meters_uk', 100, 'proximity', 'Hotspot resolve proximity - UK (meters)', 'Max distance to resolve a nearby problem report via a plain cleanup submission (UK).'),
  ('hotspot_proximity_meters_us', 91.44, 'proximity', 'Hotspot resolve proximity - US (meters)', 'Max distance to resolve a nearby problem report via a plain cleanup submission (non-UK, 300 ft).'),
  ('cleanup_event_proximity_meters', 150, 'proximity', 'Cleanup event check-in proximity (meters)', 'Max distance from a group cleanup event location to self-check-in.'),
  ('report_count_threshold_default', 5, 'triggers', 'Report-count trigger default threshold', 'Fallback report count used when a trigger row has no explicit threshold configured.'),
  ('threshold_reached_default', 1000, 'triggers', 'Score-threshold trigger default', 'Fallback score threshold used when a trigger row has no explicit threshold configured.'),
  ('hotspot_event_duration_hours', 72, 'triggers', 'Hotspot event duration (hours)', 'How long a report-count-triggered Trash Hotspot event stays active by default.'),
  ('threshold_reached_event_duration_hours', 168, 'triggers', 'Threshold-reached event duration (hours)', 'How long a score-threshold-triggered event stays active.'),
  ('time_elapsed_default_hours', 24, 'triggers', 'Time-elapsed trigger default (hours)', 'Fallback hours-since-campaign-creation before a time_elapsed trigger fires.'),
  ('time_elapsed_event_duration_hours_default', 48, 'triggers', 'Time-elapsed event duration default (hours)', 'Fallback duration such a triggered event stays active.'),
  ('flag_auto_hide_threshold', 3, 'moderation', 'Flag auto-hide threshold', 'Number of distinct user flags before a report is auto-hidden pending review.');

-- Make the "1 point per submitted report" rule (previously a hardcoded literal) read the
-- trash_report_value setting instead, so admin edits take effect on new reports without a
-- deploy. Recreated from migration 050_campaign_spendable_points.sql (the most recent prior
-- version, which added the counts_toward_spendable_points block) with both literal `1`s
-- replaced by the setting lookup — the spendable_points half must be preserved here or this
-- CREATE OR REPLACE silently reverts reports to never crediting spendable_points at all.
CREATE OR REPLACE FUNCTION sync_profile_points_from_report()
RETURNS TRIGGER AS $$
DECLARE
  v_value numeric;
BEGIN
  SELECT value INTO v_value FROM game_settings WHERE key = 'trash_report_value';
  v_value := COALESCE(v_value, 1);

  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by_user_id IS NOT NULL THEN
      UPDATE profiles SET points = points + v_value WHERE id = NEW.submitted_by_user_id;

      IF EXISTS (
        SELECT 1 FROM campaigns WHERE id = NEW.campaign_id AND counts_toward_spendable_points
      ) THEN
        UPDATE profiles SET spendable_points = spendable_points + v_value WHERE id = NEW.submitted_by_user_id;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.submitted_by_user_id IS NOT NULL THEN
      UPDATE profiles SET points = points - v_value WHERE id = OLD.submitted_by_user_id;

      IF EXISTS (
        SELECT 1 FROM campaigns WHERE id = OLD.campaign_id AND counts_toward_spendable_points
      ) THEN
        UPDATE profiles SET spendable_points = spendable_points - v_value WHERE id = OLD.submitted_by_user_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
