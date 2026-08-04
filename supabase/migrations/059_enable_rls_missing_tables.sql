-- cleanup_event_photos, cleanup_team_total_logs, and geo_unit_adjacency were created without
-- RLS enabled, leaving them fully open to the anon/authenticated Postgres roles (the security
-- advisory scanner flags this). In practice every read/write to these three tables goes through
-- the FastAPI backend's service-role connection, which bypasses RLS entirely — the frontend
-- never queries them directly via the Supabase client — so enabling RLS here with a public-read
-- policy and no write policies for anon/authenticated does not change any existing app behavior.
ALTER TABLE cleanup_event_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleanup_team_total_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_unit_adjacency ENABLE ROW LEVEL SECURITY;

-- Event photos and the team-total audit trail are both already shown to any visitor viewing a
-- cleanup event's public page, and adjacency data is non-sensitive geographic reference data —
-- so all three get an open read policy. No insert/update/delete policies: those stay backend
-- (service-role)-only, matching what the app's authorization logic already assumes.
CREATE POLICY "cleanup_event_photos_select" ON cleanup_event_photos
  FOR SELECT USING (true);

CREATE POLICY "cleanup_team_total_logs_select" ON cleanup_team_total_logs
  FOR SELECT USING (true);

CREATE POLICY "geo_unit_adjacency_select" ON geo_unit_adjacency
  FOR SELECT USING (true);
