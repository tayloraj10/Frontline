-- Expand campaign_events status to support admin pause and cancel actions.
ALTER TABLE campaign_events
  DROP CONSTRAINT IF EXISTS campaign_events_status_check;

ALTER TABLE campaign_events
  ADD CONSTRAINT campaign_events_status_check
  CHECK (status IN ('active', 'paused', 'cancelled', 'resolved', 'expired'));
