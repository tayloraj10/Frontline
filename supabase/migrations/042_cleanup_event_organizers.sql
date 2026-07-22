-- Per-event organizer role: the event creator is always an organizer, and
-- organizers can promote other attendees to co-organizer. Previously "organizer"
-- was just "is this viewer a group admin", which made every admin of a group
-- look like the organizer of every event that group hosts, even ones they had
-- nothing to do with.

ALTER TABLE cleanup_rsvps ADD COLUMN is_organizer boolean NOT NULL DEFAULT false;

UPDATE cleanup_rsvps r
SET is_organizer = true
FROM cleanups c
WHERE c.id = r.cleanup_id AND c.submitted_by_user_id = r.user_id;
