-- "email_toggles" read awkwardly as a settings-page section header; rename to
-- "notifications", which is what these three killswitches actually are.
UPDATE game_settings SET category = 'notifications' WHERE category = 'email_toggles';
