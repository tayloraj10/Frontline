-- Moves values that were hardcoded into admin-editable game settings.
-- retake_wait_hours: how long a person must wait before taking the same job or site again after giving it up,
-- running out of time, or (sites) finishing a cleanup. Jobs and sites share it.
-- The two extend settings drive the "I need more time" button on a claimed site.
INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('retake_wait_hours', 24, 'payments', 'Wait before taking the same job or site again (hours)',
   'After giving up a job or site, running out of time, or finishing a site cleanup, the person has to wait this long before taking the same one again. Shared by jobs and sites.'),
  ('sponsored_claim_extend_minutes', 60, 'payments', 'Sponsored site: time added by "I need more time" (minutes)',
   'How much the cleanup timer grows each time a claimant asks for more time.'),
  ('sponsored_claim_max_total_minutes', 360, 'payments', 'Sponsored site: longest total cleanup time (minutes)',
   'The most time a claimant can have on a site from their before photo, counting every extension.')
ON CONFLICT (key) DO NOTHING;
