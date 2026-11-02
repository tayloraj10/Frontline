-- Hire: whether the customer has a payment card saved. Kept in step with Stripe whenever the card status is
-- checked (posting a job, the post page), so the job board can hide jobs nobody could be paid for.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hire_card_on_file BOOLEAN NOT NULL DEFAULT false;
