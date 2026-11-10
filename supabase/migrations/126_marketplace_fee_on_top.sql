-- Hire fee model: the hirer pays a service fee on top of the posted price and the cleaner nets the
-- full posted amount. Jobs created before this keep the old deduct-from-cleaner behavior.
ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS fee_on_top boolean NOT NULL DEFAULT false;

INSERT INTO game_settings (key, value, category, label, description) VALUES
  ('marketplace_min_job_cents', 1500, 'payments', 'Marketplace: minimum job price (cents)', 'Lowest posted price allowed for a Hire job, in cents. Keep it high enough that the service fee covers Stripe''s card fee.')
ON CONFLICT (key) DO NOTHING;

-- 10 was a placeholder. 5.5 percent, paid by the hirer on top of the price. Break-even on Stripe's
-- card fee at the $15 minimum job is about 5.05 percent, so 5.5 leaves a small margin.
UPDATE game_settings
SET value = 5.5,
    description = 'Service fee as a percent of the posted price, added on top and paid by the hirer. The cleaner receives the full posted price. Must cover Stripe''s card fee (about 2.9% + 30 cents) or each job loses money.'
WHERE key = 'marketplace_platform_fee_percent' AND value IN (10, 5);
