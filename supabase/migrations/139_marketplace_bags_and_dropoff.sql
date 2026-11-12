-- Bag drop-off consent on posted jobs, and the cleaner's "all bags are in the photo" acknowledgement.
-- Additive and nullable/defaulted, so it is safe to apply before the code that uses it ships.
ALTER TABLE marketplace_jobs
  ADD COLUMN bag_dropoff_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN bag_dropoff_address text,
  ADD COLUMN bag_dropoff_note text,
  ADD COLUMN bags_ack_at timestamptz,
  ADD COLUMN bags_count integer CHECK (bags_count IS NULL OR bags_count BETWEEN 0 AND 500);
