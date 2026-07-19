-- "Claim-a-report" challenge mode: an optional, higher-reward alternative to logging a
-- cleanup within range of a report. Claiming locks the report to one user through two
-- timed phases (arrive + before photo, then clean up + after photo). The existing
-- "log a cleanup in range" flow is untouched and still works on any *unclaimed* open report.
--
-- status reuses the existing vocabulary: 'scheduled' = claimed, awaiting before photo;
-- 'in_progress' = before photo submitted, awaiting after photo; expiry reverts to 'open'.
-- claimed_by_user_id / claim_released_at are intentionally left in place after an expiry
-- (rather than cleared) so a short reclaim cooldown can be enforced for the same user.

ALTER TABLE problem_reports ADD COLUMN claimed_by_user_id UUID REFERENCES profiles(id);
ALTER TABLE problem_reports ADD COLUMN claimed_at TIMESTAMPTZ;
ALTER TABLE problem_reports ADD COLUMN claim_before_deadline_at TIMESTAMPTZ;
ALTER TABLE problem_reports ADD COLUMN before_photo_url TEXT;
ALTER TABLE problem_reports ADD COLUMN before_submitted_at TIMESTAMPTZ;
ALTER TABLE problem_reports ADD COLUMN claim_after_deadline_at TIMESTAMPTZ;
ALTER TABLE problem_reports ADD COLUMN claim_released_at TIMESTAMPTZ;

CREATE INDEX problem_reports_claimed_by_idx ON problem_reports(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;

-- Claim-expiry notifications (type = 'claim_expired') reuse the existing user_notifications
-- table as-is (type is a free-form TEXT column, no CHECK constraint to extend). They are
-- inserted from the backend when expiry is detected on read/write of the report row, not
-- via a DB trigger — expiry is a passage of time, not a row event, so there's nothing for a
-- trigger to fire on; this follows the "check on read" pattern noted in the backlog doc
-- rather than adding new cron infra.
