-- Per-event choice between organizer logging one team total at the end vs.
-- attendees individually self-logging. Defaults to organizer_total, which also
-- backfills existing live events to the mode that matches current org convention.

ALTER TABLE cleanups
  ADD COLUMN logging_mode text NOT NULL DEFAULT 'organizer_total'
  CHECK (logging_mode IN ('organizer_total', 'individual'));
