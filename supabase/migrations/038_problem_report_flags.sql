-- "Report inaccurate" flagging for trash reports (Trash War backlog item #3 follow-up):
-- lets any user flag a report as wrong/bogus (bad location, no actual trash, etc). Once 3
-- distinct users have flagged the same report it's auto-pulled from the public map
-- ('flagged' status) pending manual review — a single bad-faith or mistaken flag can't
-- take a legitimate report down on its own, but a clearly-bogus report doesn't stay live
-- indefinitely waiting on a human. Reports already claimed/in-progress can still be
-- flagged (e.g. the claimant discovers on arrival that the pin is wrong); the backend
-- releases the claim when a flag causes a report to transition to 'flagged'.

CREATE TABLE problem_report_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES problem_reports(id) ON DELETE CASCADE,
  flagged_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, flagged_by_user_id)
);

CREATE INDEX problem_report_flags_report_id_idx ON problem_report_flags(report_id);

ALTER TABLE problem_reports DROP CONSTRAINT problem_reports_status_check;
ALTER TABLE problem_reports ADD CONSTRAINT problem_reports_status_check
  CHECK (status IN ('open', 'scheduled', 'in_progress', 'completed', 'addressed', 'verified', 'cancelled', 'flagged'));

ALTER TABLE problem_report_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "problem_report_flags_select" ON problem_report_flags FOR SELECT USING (true);
CREATE POLICY "problem_report_flags_insert" ON problem_report_flags FOR INSERT WITH CHECK (auth.uid() = flagged_by_user_id);
