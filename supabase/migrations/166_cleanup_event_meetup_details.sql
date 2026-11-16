-- Optional "where exactly to meet" note for cleanup events (e.g. "By the bagel shop on the
-- corner, look for the green shirts"). Free text, shown on the event page and the shareable
-- flyer. Not backfilled.

ALTER TABLE cleanups
  ADD COLUMN IF NOT EXISTS meetup_details TEXT;
