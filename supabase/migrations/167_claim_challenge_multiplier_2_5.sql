-- Raises the claim challenge multiplier from 1.5 to 2.5.
-- Active score multipliers (hotspot, bonus spot, claim challenge) do not stack, the largest wins.
-- At 1.5 the claim bonus lost to the 2x hotspot multiplier, so claiming a trash report inside a
-- hotspot zip paid the same as a plain cleanup. 2.5 keeps claiming a report the better choice.
-- Only bumps rows still at the old default so an admin-tuned value is not overwritten.
UPDATE game_settings
SET value = 2.5, updated_at = now()
WHERE key = 'claim_challenge_multiplier'
  AND value = 1.5;
