-- Grant the API roles access to the dev schema, mirroring Supabase's
-- default grants on public (which are applied automatically at project
-- creation and don't extend to schemas we create ourselves).

GRANT USAGE ON SCHEMA dev TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA dev TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dev GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dev GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
