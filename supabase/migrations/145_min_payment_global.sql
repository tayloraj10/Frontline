-- One global floor for money put into a job or a sponsorship (cents). Replaces the job-only
-- marketplace_min_job_cents. Keep it high enough that fees cover Stripe's card fee.
INSERT INTO game_settings (key, value, category, label, description)
SELECT 'min_payment_cents',
       COALESCE((SELECT GREATEST(value, 1500) FROM game_settings WHERE key = 'marketplace_min_job_cents'), 1500),
       'payments',
       'Minimum payment (cents)',
       'Lowest amount allowed for a Hire job or a sponsorship (including a crowdfund goal), in cents. Keep it high enough that fees cover Stripe''s card fee.'
ON CONFLICT (key) DO NOTHING;

DELETE FROM game_settings WHERE key = 'marketplace_min_job_cents';
