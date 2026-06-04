-- RLS for campaigns and geo_units (public read, admin-only write)

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select" ON campaigns FOR SELECT USING (true);
CREATE POLICY "geo_units_select" ON geo_units FOR SELECT USING (true);
