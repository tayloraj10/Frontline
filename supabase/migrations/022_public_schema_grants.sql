-- Hosted Supabase projects get default anon/authenticated/service_role grants
-- on the public schema applied automatically at project bootstrap. A local
-- CLI stack starts from a blank Postgres and never gets that bootstrap step,
-- so tables created purely through migrations (campaigns, geo_units,
-- profiles, event_triggers, ...) have no grants at all for those roles —
-- PostgREST returns "permission denied" even though RLS policies allow the
-- read. Mirrors 018_dev_schema_grants.sql, applied to public instead of dev.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
