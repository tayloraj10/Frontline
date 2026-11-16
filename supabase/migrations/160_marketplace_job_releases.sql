-- Remembers who gave a board job back (or lost it by not arriving), for a 24 hour freeze before they can retake it.
CREATE TABLE IF NOT EXISTS marketplace_job_releases (
  job_id uuid NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  cleaner_id uuid NOT NULL REFERENCES profiles(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, cleaner_id)
);
ALTER TABLE marketplace_job_releases ENABLE ROW LEVEL SECURITY;
