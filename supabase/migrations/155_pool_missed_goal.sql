-- Pools that miss their goal are no longer refunded automatically. At the deadline an open pool
-- with money in it moves to 'goal_missed' and the starter chooses: run it with what was raised,
-- extend the deadline, or cancel and refund. If the starter does nothing by missed_deadline
-- (14 days), every contribution is refunded.

ALTER TABLE sponsorship_pools ADD COLUMN missed_deadline timestamptz;

ALTER TABLE sponsorship_pools DROP CONSTRAINT sponsorship_pools_status_check;
ALTER TABLE sponsorship_pools
  ADD CONSTRAINT sponsorship_pools_status_check
  CHECK (status IN ('open', 'goal_missed', 'active', 'expired', 'cancelled'));
