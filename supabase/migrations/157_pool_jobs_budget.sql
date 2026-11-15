-- Pool plan 'jobs': the raised money is a jobs budget. The pool starter posts marketplace jobs against
-- it (never more than the unspent balance); cleaners are paid from the platform balance that holds the
-- contributions. The starter cannot approve work on their own pool: contributors do (or an admin).
-- Closing the pool refunds what is left pro rata (contribution.refunded_cents).

ALTER TABLE sponsorship_pools DROP CONSTRAINT sponsorship_pools_status_check;
ALTER TABLE sponsorship_pools
  ADD CONSTRAINT sponsorship_pools_status_check
  CHECK (status IN ('open', 'goal_missed', 'handoff', 'voting', 'choosing', 'active', 'closed', 'expired', 'cancelled'));

ALTER TABLE sponsorship_pools DROP CONSTRAINT sponsorship_pools_plan_kind_check;
ALTER TABLE sponsorship_pools
  ADD CONSTRAINT sponsorship_pools_plan_kind_check CHECK (plan_kind IN ('rule', 'group', 'vote', 'jobs'));

ALTER TABLE sponsorship_pools DROP CONSTRAINT sponsorship_pools_rule_present;
ALTER TABLE sponsorship_pools
  ADD CONSTRAINT sponsorship_pools_rule_present
  CHECK (payout_rule IS NOT NULL OR plan_kind IN ('vote', 'jobs') OR status IN ('choosing', 'expired', 'cancelled'));

ALTER TABLE sponsorship_pools
  ADD COLUMN jobs_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN jobs_deadline timestamptz,
  ADD COLUMN closed_at timestamptz;

ALTER TABLE sponsorship_pool_contributions ADD COLUMN refunded_cents integer NOT NULL DEFAULT 0;

ALTER TABLE marketplace_jobs ADD COLUMN pool_id uuid REFERENCES sponsorship_pools(id) ON DELETE SET NULL;
CREATE INDEX marketplace_jobs_pool_idx ON marketplace_jobs (pool_id) WHERE pool_id IS NOT NULL;
