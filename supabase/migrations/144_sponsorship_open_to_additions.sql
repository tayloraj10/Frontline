-- Sponsored sites and areas can be added onto by other people (default) or kept
-- sole-credit. A top-up is its own sponsorships row (so it has its own payer, Stripe
-- payment and refund) that points at the parent via topup_of. When a top-up is funded,
-- its amount is added to the parent's remaining_cents; the top-up row itself holds no
-- claimable balance and is never listed as a site.

ALTER TABLE sponsorships
  ADD COLUMN IF NOT EXISTS open_to_additions boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS topup_of uuid REFERENCES sponsorships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sponsorships_topup_of_idx ON sponsorships(topup_of) WHERE topup_of IS NOT NULL;
