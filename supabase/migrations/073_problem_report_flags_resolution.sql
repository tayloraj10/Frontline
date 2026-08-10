-- Adds resolution tracking to problem_report_flags, mirroring 072_content_flags_resolution.sql,
-- so flagged trash reports can be merged into the same admin Moderation queue as content_flags
-- instead of only being visible via silent auto-hide-at-threshold. "hide" here means the same
-- thing flag_problem_report's auto-hide branch already does (status -> 'flagged', pulling it off
-- the map) rather than removing a photo, since a problem_report's photo is required and can't
-- just be nulled out the way content_flags' optional photos can.

ALTER TABLE problem_report_flags ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE problem_report_flags ADD COLUMN resolved_by UUID REFERENCES profiles(id);
ALTER TABLE problem_report_flags ADD COLUMN resolution TEXT CHECK (resolution IN ('hidden', 'dismissed'));

CREATE INDEX problem_report_flags_unresolved_idx ON problem_report_flags(report_id) WHERE resolved_at IS NULL;
