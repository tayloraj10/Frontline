-- Optional RSVP capacity cap for group-hosted cleanup events. NULL means unlimited
-- (the default, preserving existing events' behavior). Enforced in the
-- POST /cleanup-events/{id}/rsvp endpoint, not via a CHECK constraint, since the cap
-- is against a COUNT(*) over cleanup_rsvps rather than a value on this row.
ALTER TABLE cleanups ADD COLUMN max_attendees integer CHECK (max_attendees IS NULL OR max_attendees > 0);
