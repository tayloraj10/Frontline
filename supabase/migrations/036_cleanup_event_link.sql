-- Optional external link (event site, waiver form, sign-up sheet, etc.) for
-- group-hosted cleanup events. NULL means none set.
ALTER TABLE cleanups ADD COLUMN external_link text;
