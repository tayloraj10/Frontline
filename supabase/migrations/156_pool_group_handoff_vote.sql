-- Pool plans beyond a plain payout rule.
--   plan_kind 'rule'  : the goal activates a funded sponsorship paying the rule (as before).
--   plan_kind 'group' : (areas only) the money is handed to one group. A group admin has
--                       handoff_deadline (7 days) to accept; accepting activates a sponsorship that
--                       only that group can attach events to. Decline or silence moves the pool to
--                       'choosing' and the starter picks a plan again.
--   plan_kind 'vote'  : contributors vote for 7 days (vote_deadline) among preset payout rules; the
--                       winner activates the pool. No votes at all refunds everyone. A vote plan
--                       cannot be changed once chosen (enforced in the service).

ALTER TABLE sponsorship_pools ALTER COLUMN payout_rule DROP NOT NULL;
ALTER TABLE sponsorship_pools
  ADD COLUMN plan_kind text NOT NULL DEFAULT 'rule' CHECK (plan_kind IN ('rule', 'group', 'vote')),
  ADD COLUMN handoff_group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  ADD COLUMN handoff_note text,
  ADD COLUMN handoff_date date,
  ADD COLUMN handoff_deadline timestamptz,
  ADD COLUMN vote_deadline timestamptz;

ALTER TABLE sponsorship_pools DROP CONSTRAINT sponsorship_pools_status_check;
ALTER TABLE sponsorship_pools
  ADD CONSTRAINT sponsorship_pools_status_check
  CHECK (status IN ('open', 'goal_missed', 'handoff', 'voting', 'choosing', 'active', 'expired', 'cancelled'));

ALTER TABLE sponsorship_pools
  ADD CONSTRAINT sponsorship_pools_rule_present
  CHECK (payout_rule IS NOT NULL OR plan_kind = 'vote' OR status IN ('choosing', 'expired', 'cancelled'));

CREATE TABLE sponsorship_pool_votes (
  pool_id uuid NOT NULL REFERENCES sponsorship_pools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('flat', 'bag', 'split')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, user_id)
);
ALTER TABLE sponsorship_pool_votes ENABLE ROW LEVEL SECURITY;

-- A funded group-area sponsorship handed to one group: only that group can host events on it.
ALTER TABLE sponsorships ADD COLUMN directed_group_id uuid REFERENCES groups(id) ON DELETE SET NULL;
