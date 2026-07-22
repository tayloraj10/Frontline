-- Backfill: create_cleanup_event previously never RSVP'd the organizer to
-- their own event, so organizers of existing events don't appear on the
-- attendee list. Add a 'going' RSVP for each event's submitted_by_user_id
-- where one doesn't already exist.

INSERT INTO cleanup_rsvps (cleanup_id, user_id, status)
SELECT c.id, c.submitted_by_user_id, 'going'
FROM cleanups c
WHERE c.submitted_by_user_id IS NOT NULL
ON CONFLICT (cleanup_id, user_id) DO NOTHING;
