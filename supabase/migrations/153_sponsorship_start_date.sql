-- Sponsors can schedule a sponsored site or group area. starts_at is when it opens to everyone;
-- Frontline Plus members see it plus_early_access_hours before that. Null means it goes live as
-- soon as it is funded (Plus first, everyone after the lead window), as before.
ALTER TABLE sponsorships ADD COLUMN IF NOT EXISTS starts_at timestamptz;

-- The Plus lead window drops from 48 hours to 24. Only touch it if nobody has tuned it.
UPDATE game_settings
   SET value = 24,
       description = 'How long before a sponsored site or group area opens to everyone that Frontline Plus members can see and take it. 0 disables the perk.'
 WHERE key = 'plus_early_access_hours' AND value = 48;
