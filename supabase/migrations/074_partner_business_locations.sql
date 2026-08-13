-- Multi-location support for partner businesses. A business's address/lat/lng used to
-- live as flat columns directly on partner_businesses (one location per business).
-- This adds a proper child table so a business can have any number of locations, each
-- shown as its own marker on the campaign map.
--
-- Deliberately NOT dropping the flat address/lat/lng/google_maps_url columns on
-- partner_businesses here -- they're left in place (unread by new code) so an in-flight
-- old frontend build doesn't break against a schema with them gone. Drop them in a
-- later cleanup migration once prod is confirmed running the new code.
--
-- Offers can optionally be pinned to one location (location_id NULL = valid at every
-- location the business has); redemptions record which location they happened at.

CREATE TABLE partner_business_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES partner_businesses(id) ON DELETE CASCADE,
  label text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  google_maps_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_partner_business_locations_business ON partner_business_locations (business_id);

-- Backfill: one location row per business that already had a lat/lng set.
INSERT INTO partner_business_locations
  (business_id, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url)
SELECT id, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url
FROM partner_businesses
WHERE lat IS NOT NULL AND lng IS NOT NULL;

ALTER TABLE partner_offers ADD COLUMN location_id uuid REFERENCES partner_business_locations(id) ON DELETE SET NULL;
ALTER TABLE partner_redemptions ADD COLUMN location_id uuid REFERENCES partner_business_locations(id) ON DELETE SET NULL;

ALTER TABLE partner_business_locations ENABLE ROW LEVEL SECURITY;

-- Same visibility shape as partner_businesses itself: active locations are public,
-- everything is visible to a site admin or that business's own admin(s).
CREATE POLICY "partner_business_locations_select" ON partner_business_locations
  FOR SELECT USING (
    status = 'active'
    OR is_site_admin()
    OR is_business_admin(business_id)
  );
CREATE POLICY "partner_business_locations_insert" ON partner_business_locations
  FOR INSERT WITH CHECK (is_site_admin() OR is_business_admin(business_id));
-- Mirrors partner_businesses_insert_pending: the public apply flow inserts a business
-- row (status = 'pending') and then its locations in the same unauthenticated request,
-- before any partner_business_admins row exists for it.
CREATE POLICY "partner_business_locations_insert_pending" ON partner_business_locations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM partner_businesses b
      WHERE b.id = business_id AND b.status = 'pending'
    )
  );
CREATE POLICY "partner_business_locations_update" ON partner_business_locations
  FOR UPDATE USING (is_site_admin() OR is_business_admin(business_id));
CREATE POLICY "partner_business_locations_delete" ON partner_business_locations
  FOR DELETE USING (is_site_admin() OR is_business_admin(business_id));
