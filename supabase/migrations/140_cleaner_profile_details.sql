-- Fleshed-out cleaner profile: extra optional details shown on the public profile.
-- All additive and defaulted, so it is safe to apply before the code that uses it ships.
ALTER TABLE cleaner_profiles
  ADD COLUMN languages text[] NOT NULL DEFAULT '{}',
  ADD COLUMN years_experience integer CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 80),
  ADD COLUMN equipment text[] NOT NULL DEFAULT '{}',
  ADD COLUMN availability text,
  ADD COLUMN preferred_size text CHECK (preferred_size IS NULL OR preferred_size IN ('small', 'medium', 'large', 'any'));
