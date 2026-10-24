-- Hire: listing photos, and location + photo verification across the cleaner's job flow.

ALTER TABLE marketplace_job_photos DROP CONSTRAINT IF EXISTS marketplace_job_photos_kind_check;
ALTER TABLE marketplace_job_photos
  ADD CONSTRAINT marketplace_job_photos_kind_check CHECK (kind IN ('listing', 'before', 'after', 'checkin', 'dispute'));

-- Where the device was when the photo was taken, and how far that was from the job site.
ALTER TABLE marketplace_job_photos
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN distance_m integer;

-- Arrival and finish location checks. location_flagged = the cleaner used the "my GPS is wrong" override.
ALTER TABLE marketplace_jobs
  ADD COLUMN check_in_distance_m integer,
  ADD COLUMN finish_distance_m integer,
  ADD COLUMN location_flagged boolean NOT NULL DEFAULT false;

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('marketplace_site_radius_m', 150, 'payments', 'Marketplace: on-site radius (meters)', 'How close to the job site (or outside its radius or drawn area) a cleaner must be to start or finish a job.')
ON CONFLICT (key) DO NOTHING;
