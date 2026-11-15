-- Optional short corner badge for a job category (shown on the filter tile and in the job types sheet).
ALTER TABLE job_categories ADD COLUMN IF NOT EXISTS badge text;

-- Text wrapped in {{double braces}} is highlighted orange by the app.
UPDATE job_categories SET
  badge = 'Good for businesses',
  description = 'Clearing trash, weeds and debris from a sidewalk, curb line or gutter edge. {{It is also a good fit for shops and other businesses that want a clean frontage, fewer fines and more customers.}}'
WHERE key = 'sidewalk';

-- Litter pickup should not mention sidewalks, which have their own category.
UPDATE job_categories SET
  description = 'Picking up loose trash and small debris.'
WHERE key = 'litter';

-- Yard cleanup: the rule note already says what it is not, so the description should not repeat it.
UPDATE job_categories SET
  description = 'Picking up trash and leaves in your own yard.'
WHERE key = 'light_yard_work';
