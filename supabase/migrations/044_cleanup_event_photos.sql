-- Lets any attendee add a photo to an event's Photos section without going through the
-- bags/pounds contribution flow — no points, no territory credit, no contribution row.
CREATE TABLE cleanup_event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_id uuid NOT NULL REFERENCES cleanups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id),
  photo_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cleanup_event_photos_cleanup_id ON cleanup_event_photos(cleanup_id, created_at DESC);
