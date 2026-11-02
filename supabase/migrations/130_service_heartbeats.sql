-- Last successful run of each scheduled job, so a silent cron failure can alert admins.
CREATE TABLE IF NOT EXISTS service_heartbeats (
  name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_alert_at timestamptz
);
ALTER TABLE service_heartbeats ENABLE ROW LEVEL SECURITY;
INSERT INTO service_heartbeats (name) VALUES ('marketplace_sweep') ON CONFLICT DO NOTHING;
