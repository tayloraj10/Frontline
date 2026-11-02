-- Hire: a cleaner who takes a job has a limited time to reach the site and start, or the job goes back on the board.
-- claim_count makes the Stripe idempotency keys unique per claim, so a re-taken job is charged again.
ALTER TABLE marketplace_jobs
  ADD COLUMN IF NOT EXISTS arrive_by timestamptz,
  ADD COLUMN IF NOT EXISTS claim_count integer NOT NULL DEFAULT 0;

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('marketplace_arrive_minutes', 120, 'payments', 'Marketplace: minutes to arrive', 'How long a cleaner has to reach the site and start after taking a job (counted from the job start time when it is scheduled). After that the job returns to the board and the customer is refunded.')
ON CONFLICT (key) DO NOTHING;
