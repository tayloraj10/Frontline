-- Flags a user as a business-only account: on login they land straight on
-- their partner dashboard instead of the campaign app, with the main nav
-- de-emphasizing the rest of the app (still reachable, not removed).

ALTER TABLE profiles
  ADD COLUMN is_business_only boolean NOT NULL DEFAULT false;
