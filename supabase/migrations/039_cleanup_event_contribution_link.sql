-- cleanup_rsvps.contribution_id only ever points at the attendee's most recent
-- submission (each resubmit overwrites it via ON CONFLICT ... DO UPDATE), so the event
-- detail/list endpoints were only ever able to see one contribution's worth of bags per
-- attendee. Give contributions a direct, non-overwritable link to the event they were
-- submitted against so all of an attendee's submissions can be aggregated, not just the
-- latest. Distinct from contributions.cleanup_id, which points at that submission's own
-- `cleanups` log row (its metrics/photos), not the event.
ALTER TABLE contributions ADD COLUMN cleanup_event_id uuid REFERENCES cleanups(id) ON DELETE SET NULL;

CREATE INDEX idx_contributions_cleanup_event_id ON contributions(cleanup_event_id) WHERE cleanup_event_id IS NOT NULL;
