#!/usr/bin/env bash
# One-off: pull a data snapshot from prod Supabase Postgres into local Supabase Postgres.
# Local-testing convenience only — never commit prod credentials, never point the running
# app itself at prod (see .env comments). Requires local Supabase to be running
# (`npx supabase start`) and Docker available.
#
# Usage:
#   PROD_DB_URL='postgresql://postgres.xxx:PASSWORD@aws-1-us-west-2.pooler.supabase.com:5432/postgres' \
#     ./backend/scripts/pull_prod_snapshot.sh
set -euo pipefail

# Prevent Git Bash/MSYS from mangling /tmp/... paths inside docker exec args into
# Windows host paths (e.g. /tmp/x -> C:/Users/.../Temp/x). Harmless on non-Windows shells.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

if [ -z "${PROD_DB_URL:-}" ]; then
  echo "Set PROD_DB_URL first, e.g.:"
  echo "  PROD_DB_URL='postgresql://postgres.xxx:PASSWORD@host:5432/postgres' $0"
  exit 1
fi

# Use pg_dump/psql *inside* the local Supabase postgres container rather than a host
# install — it's guaranteed to match prod's Postgres major version, whereas host pg_dump
# versions are often mismatched and refuse to run against a newer server.
CONTAINER="supabase_db_frontline"
DUMP_FILE="/tmp/prod_snapshot.sql"

# Preserved across the wipe/restore below so local testing always has a known-good login.
# LOCAL_API_URL/LOCAL_SERVICE_ROLE_KEY default to the fixed local `supabase start` demo
# project values (not secrets — same for every local Supabase CLI install); override if
# your local stack uses different ports/keys.
TEST_USER_EMAIL="test@gmail.com"
TEST_USER_PASSWORD="password"
LOCAL_API_URL="${LOCAL_API_URL:-http://127.0.0.1:54321}"
LOCAL_SERVICE_ROLE_KEY="${LOCAL_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"

# Order matters for readability only — FK checks are disabled during restore below,
# so this doesn't need to be strict dependency order.
#
# Every table below is here because it's cascade-wiped by the TRUNCATE below (directly or
# transitively, via ON DELETE CASCADE off profiles/groups/geo_units/campaigns/cleanups/
# problem_reports) and must therefore also be re-dumped from prod — otherwise it's silently
# left empty after every sync. This has bitten us three times now (problem_reports, then
# event_triggers wiping out the hotspot trigger config, then game_settings wiping out every
# admin-tuned point value) — when adding a new table with a cascading FK to any table in the
# TRUNCATE list below (including a plain `REFERENCES profiles(id)` column with no explicit
# ON DELETE — TRUNCATE ... CASCADE truncates the whole referencing table regardless of the
# FK's own ON DELETE action), add it here too.
# partner_businesses/partner_offers are included explicitly (not because they're
# cascade-wiped by something else) so local reflects real prod partner/offer data instead
# of local-only test rows. They're also added to the TRUNCATE list below so re-running this
# doesn't just append prod rows alongside stale local test businesses/offers.
TABLES=(profiles groups group_members geo_units campaigns cleanups contributions territory_claims problem_reports partner_businesses partner_offers partner_redemptions partner_offer_codes cleanup_rsvps cleanup_team_total_logs event_triggers campaign_events campaign_event_geo_units leaderboard_entries user_notifications campaign_partner_businesses partner_business_admins problem_report_flags cleanup_event_cohosts cleanup_event_photos geo_unit_adjacency game_settings)

TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=(-t "$t")
done

echo "Dumping ${TABLES[*]} from prod..."
docker exec "$CONTAINER" pg_dump "$PROD_DB_URL" --data-only --no-owner "${TABLE_ARGS[@]}" -f "$DUMP_FILE"

# Prod has occasionally drifted ahead of what's checked into supabase/migrations (e.g. a
# campaigns.contribution_type/geo_unit/campaign_type/status value not yet in any local
# migration file). Drop these check constraints before restoring so drifted rows don't
# block the whole snapshot; this is local-only and does not touch prod's schema. If a
# restore fails with a new "violates check constraint" error, add that constraint here too.
echo "Relaxing known-drifted local check constraints for restore..."
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "
  ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_contribution_type_check;
  ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_geo_unit_check;
  ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_campaign_type_check;
  ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
"

echo "Backing up local test user ($TEST_USER_EMAIL) profile before wipe..."
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "
  DROP TABLE IF EXISTS _test_user_profile_backup;
  CREATE TABLE _test_user_profile_backup AS
  SELECT p.* FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = '$TEST_USER_EMAIL';
"

echo "Wiping matching local tables..."
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "
  TRUNCATE TABLE territory_claims, contributions, cleanup_team_total_logs, cleanup_rsvps, cleanups, partner_redemptions, partner_offer_codes, partner_offers, partner_businesses, problem_reports, group_members, campaigns, groups, geo_units, profiles RESTART IDENTITY CASCADE;
"

echo "Restoring prod snapshot into local db..."
# session_replication_role=replica disables FK/trigger enforcement during load —
# needed because profiles.id -> auth.users(id) won't resolve locally for prod user ids.
# Prepended in the same session/transaction as the restore so it actually applies.
docker exec "$CONTAINER" bash -c "
  { echo 'SET session_replication_role = replica;'; cat '$DUMP_FILE'; } > /tmp/prod_snapshot_wrapped.sql &&
  psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/prod_snapshot_wrapped.sql &&
  rm -f /tmp/prod_snapshot_wrapped.sql
"

docker exec "$CONTAINER" rm -f "$DUMP_FILE"

# The restore above bypasses profiles.id -> auth.users(id), so restored profiles are left
# dangling. That's normally invisible, but anything that later UPDATEs one of those profiles
# rows (e.g. the sync_profile_points trigger on contributions insert/delete) re-validates the
# FK and fails. Stub in a minimal auth.users row for each so the FK actually resolves locally.
echo "Stubbing local auth.users rows for restored profiles..."
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "
  SET session_replication_role = replica;
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT p.id, 'authenticated', 'authenticated', COALESCE(p.username, p.id::text) || '@local-snapshot.invalid', now(), now(), '{}'::jsonb, '{}'::jsonb
  FROM profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
  ON CONFLICT (id) DO NOTHING;
  RESET session_replication_role;
"

echo "Restoring local test user profile row (if it existed before the wipe)..."
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "
  SET session_replication_role = replica;
  INSERT INTO profiles SELECT * FROM _test_user_profile_backup
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    bio = EXCLUDED.bio,
    total_contributions = EXCLUDED.total_contributions,
    points = EXCLUDED.points,
    spendable_points = EXCLUDED.spendable_points,
    created_at = EXCLUDED.created_at;
  RESET session_replication_role;
  DROP TABLE IF EXISTS _test_user_profile_backup;
"

TEST_USER_EXISTS=$(docker exec "$CONTAINER" psql -U postgres -tA -c "SELECT 1 FROM auth.users WHERE email = '$TEST_USER_EMAIL';")
if [ "$TEST_USER_EXISTS" != "1" ]; then
  echo "Test user not found locally, creating via local Auth admin API..."
  curl -s -o /dev/null -w "  -> admin API status: %{http_code}\n" -X POST "$LOCAL_API_URL/auth/v1/admin/users" \
    -H "apikey: $LOCAL_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $LOCAL_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_USER_EMAIL\",\"password\":\"$TEST_USER_PASSWORD\",\"email_confirm\":true}"
  echo "Created local test user $TEST_USER_EMAIL / $TEST_USER_PASSWORD (profile row auto-created by on_auth_user_created trigger)."
else
  echo "Test user $TEST_USER_EMAIL already present locally (auth.users untouched by the wipe; profile restored above if it existed)."
fi

# Covers the case where auth.users already had this test user but it had no profiles row
# to back up in the first place (e.g. it was created directly in auth.users, or a prior
# run of this script only just created it) — without this, such a user is left profile-less
# after the wipe since there was nothing to restore.
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "
  INSERT INTO profiles (id, username, display_name)
  SELECT u.id, 'testuser', 'Test User'
  FROM auth.users u
  WHERE u.email = '$TEST_USER_EMAIL'
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
  ON CONFLICT (username) DO NOTHING;
"

echo "Done. Local db now has a prod data snapshot for: ${TABLES[*]}"
