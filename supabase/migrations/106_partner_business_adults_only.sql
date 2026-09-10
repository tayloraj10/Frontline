-- Adds an adults-only (21+) flag for partner businesses that can only serve
-- customers 21 or older (e.g. a dispensary partner). No RLS changes needed;
-- the column rides along with the existing partner_businesses select/update
-- policies.

ALTER TABLE partner_businesses
  ADD COLUMN adults_only boolean NOT NULL DEFAULT false;
