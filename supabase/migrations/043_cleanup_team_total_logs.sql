-- Each POST /cleanup-events/{id}/log-team-total call only credits attendees who don't
-- already have a contribution (see cleanup_rsvps.contribution_id) — it's a "top up
-- whoever's uncredited" operation, not a re-split of a combined total across everyone.
-- That's easy to misread as a bug when re-running it, so keep an audit trail organizers
-- can see in the UI of every past submission for an event.
CREATE TABLE cleanup_team_total_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_id uuid NOT NULL REFERENCES cleanups(id) ON DELETE CASCADE,
  organizer_user_id uuid REFERENCES profiles(id),
  scoring_method text NOT NULL,
  small_bags integer,
  large_bags integer,
  pounds numeric,
  total_value numeric NOT NULL,
  credited_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cleanup_team_total_logs_cleanup_id ON cleanup_team_total_logs(cleanup_id, created_at DESC);
