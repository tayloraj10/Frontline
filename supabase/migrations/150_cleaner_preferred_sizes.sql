-- Preferred job sizes become a multi-select. Empty means no preference.
-- Additive: the old preferred_size column is left in place (unused) so code deployed before this still works.
ALTER TABLE cleaner_profiles
  ADD COLUMN preferred_sizes text[] NOT NULL DEFAULT '{}'
    CHECK (preferred_sizes <@ ARRAY['small', 'medium', 'large']::text[]);

UPDATE cleaner_profiles SET preferred_sizes = CASE
  WHEN preferred_size IN ('small', 'medium', 'large') THEN ARRAY[preferred_size]
  ELSE '{}'
END
WHERE preferred_size IS NOT NULL;
