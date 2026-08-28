-- Double the default bonus spot claim radius (300ft -> 600ft) so spots are easier
-- to actually reach and claim in the field.
UPDATE game_settings SET value = 182.88, updated_at = now() WHERE key = 'bonus_spot_default_radius_m';
