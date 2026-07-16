-- The dev/public schema split (017_dev_schema.sql, 018_dev_schema_grants.sql) is
-- retired: the app now reads/writes public only (search_path is hardcoded, and
-- NEXT_PUBLIC_DB_SCHEMA is gone from the frontend). Local dev runs against a
-- separate local Postgres instance instead, so a second in-DB schema is no
-- longer needed for isolation.
--
-- Before running this against a shared/prod project, confirm dev.* is empty or
-- that any rows in it have already been migrated to public.* — see
-- 017_dev_schema.sql for the original table list.

DROP SCHEMA IF EXISTS dev CASCADE;
