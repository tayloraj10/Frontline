-- Adds a human-readable address to cleanup events (dev-backlog-2026-07-24.md #15).
-- AddressAutocomplete already resolves a typed address to lat/lng on the create/edit
-- forms, but the address string itself was discarded after geocoding. Split into parts
-- (address_line1, city, state, postal_code, country) mirroring partner_businesses'
-- location columns (028_partner_business_location.sql) rather than one flat string, so
-- the same shape is reused across the app. All optional, not backfilled: existing rows
-- stay NULL since there's no reverse-geocoding in place.

ALTER TABLE cleanups
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN city TEXT,
  ADD COLUMN state TEXT,
  ADD COLUMN postal_code TEXT,
  ADD COLUMN country TEXT;
