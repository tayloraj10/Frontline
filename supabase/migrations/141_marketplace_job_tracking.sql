-- Live route tracking for marketplace jobs. Points are recorded by the native app between the arrival
-- check-in and the finished-photo submission, and are visible to the cleaner and admins only.
CREATE TABLE marketplace_job_track_points (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES marketplace_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m real,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, recorded_at)
);
CREATE INDEX marketplace_job_track_points_job_idx ON marketplace_job_track_points (job_id, recorded_at);
ALTER TABLE marketplace_job_track_points ENABLE ROW LEVEL SECURITY;

-- Set when the cleaner finishes without a usable track (phone died, app killed, no signal) and uses the
-- override instead. Never a silent block: it flags the job for admin review rather than stranding pay.
ALTER TABLE marketplace_jobs
  ADD COLUMN track_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN track_flag_reason text;

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('marketplace_min_track_points', 3, 'payments', 'Marketplace: minimum route points', 'How many tracked location points a job needs before the cleaner can mark it complete without the missing-route override.')
ON CONFLICT (key) DO NOTHING;
