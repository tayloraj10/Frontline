-- Tracks explicit user acceptance of the Terms of Service and Privacy Policy
-- separately (dev-backlog-2026-07-24.md #10). Terms and Privacy are versioned
-- independently since editing one shouldn't force re-acceptance of the other.
--
-- Deliberately NOT backfilled: existing rows stay NULL, which makes every
-- pre-existing user "stale" against the current version constants
-- (frontend/src/lib/legal.ts) and routes them through the same blocking
-- re-acceptance gate a future doc update would trigger — no separate
-- migration needed to handle existing users.

ALTER TABLE profiles ADD COLUMN terms_version_accepted TEXT;
ALTER TABLE profiles ADD COLUMN terms_accepted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN privacy_version_accepted TEXT;
ALTER TABLE profiles ADD COLUMN privacy_accepted_at TIMESTAMPTZ;
