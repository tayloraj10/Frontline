-- Add civic_action and unfollow contribution types for Road to Independence and BRAINROT campaigns
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_contribution_type_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_contribution_type_check
  CHECK (contribution_type IN ('cleanup', 'photo', 'registration', 'advocacy', 'civic_action', 'unfollow'));
