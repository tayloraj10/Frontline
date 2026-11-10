-- Last Stripe failure while moving money for a Hire job (capture, transfer or refund). Cleared on success.
-- Lets admins see jobs stuck on a payment problem and retry them.
ALTER TABLE marketplace_jobs ADD COLUMN IF NOT EXISTS payment_error text;
