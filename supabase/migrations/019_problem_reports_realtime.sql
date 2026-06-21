-- problem_reports was never added to the supabase_realtime publication when it was
-- introduced in 002_event_system.sql (and 017_dev_schema.sql mirrored that omission),
-- so the frontend's postgres_changes INSERT subscription for trash reports never fires.
ALTER PUBLICATION supabase_realtime ADD TABLE problem_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE dev.problem_reports;
