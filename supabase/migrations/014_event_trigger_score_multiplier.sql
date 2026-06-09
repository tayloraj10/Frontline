-- Expand event_type to include score_multiplier for Solarpunk milestone triggers
ALTER TABLE event_triggers DROP CONSTRAINT IF EXISTS event_triggers_event_type_check;
ALTER TABLE event_triggers ADD CONSTRAINT event_triggers_event_type_check
  CHECK (event_type IN ('boss_spawn', 'decay_start', 'cascade_unlock', 'seasonal_reset', 'notification', 'score_multiplier'));
