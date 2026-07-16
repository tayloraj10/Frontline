-- Admin-created manual events can now span multiple geo_units (e.g. several zip
-- codes), and can carry an image shown on the map. campaign_events.geo_unit_id
-- stays as-is (backend trigger-firing code in events.py writes it directly and
-- must not change); this adds an additive join table so an event can reference
-- any number of areas. Existing rows are backfilled so all map/backend code can
-- read areas from one place going forward.

ALTER TABLE campaign_events ADD COLUMN image_url text;

CREATE TABLE campaign_event_geo_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES campaign_events(id) ON DELETE CASCADE,
  geo_unit_id uuid NOT NULL REFERENCES geo_units(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, geo_unit_id)
);

CREATE INDEX idx_campaign_event_geo_units_event ON campaign_event_geo_units (event_id);
CREATE INDEX idx_campaign_event_geo_units_geo_unit ON campaign_event_geo_units (geo_unit_id);

INSERT INTO campaign_event_geo_units (event_id, geo_unit_id)
SELECT id, geo_unit_id FROM campaign_events WHERE geo_unit_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE campaign_event_geo_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_event_geo_units_select" ON campaign_event_geo_units
  FOR SELECT USING (true);
CREATE POLICY "campaign_event_geo_units_insert" ON campaign_event_geo_units
  FOR INSERT WITH CHECK (is_site_admin());
CREATE POLICY "campaign_event_geo_units_delete" ON campaign_event_geo_units
  FOR DELETE USING (is_site_admin());
