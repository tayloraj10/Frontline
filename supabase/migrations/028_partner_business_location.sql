-- Partner businesses need location/contact data to show up on the campaign map,
-- and a many-to-many link to campaigns (a business can offer perks on several
-- campaigns at once, set at creation and editable afterward).

ALTER TABLE partner_businesses
  ADD COLUMN address_line1 text,
  ADD COLUMN address_line2 text,
  ADD COLUMN city text,
  ADD COLUMN state text,
  ADD COLUMN postal_code text,
  ADD COLUMN country text,
  ADD COLUMN lat double precision,
  ADD COLUMN lng double precision,
  ADD COLUMN google_maps_url text,
  ADD COLUMN social_links jsonb;

CREATE TABLE campaign_partner_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES partner_businesses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, business_id)
);

CREATE INDEX idx_campaign_partner_businesses_campaign ON campaign_partner_businesses (campaign_id);
CREATE INDEX idx_campaign_partner_businesses_business ON campaign_partner_businesses (business_id);

ALTER TABLE campaign_partner_businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_partner_businesses_select" ON campaign_partner_businesses
  FOR SELECT USING (true);
CREATE POLICY "campaign_partner_businesses_insert" ON campaign_partner_businesses
  FOR INSERT WITH CHECK (is_site_admin());
CREATE POLICY "campaign_partner_businesses_update" ON campaign_partner_businesses
  FOR UPDATE USING (is_site_admin());
CREATE POLICY "campaign_partner_businesses_delete" ON campaign_partner_businesses
  FOR DELETE USING (is_site_admin());
