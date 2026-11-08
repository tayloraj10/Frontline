-- profiles_update is `auth.uid() = id` with no column restriction, so any signed-in user could
-- PATCH their own row through PostgREST and set is_admin, points and the payment columns.
-- This guard rejects direct client edits of those columns unless the caller is a site admin.
--
-- Not blocked:
--   * the backend and edge functions (direct connection or service role, so auth.uid() is null)
--   * the points triggers on contributions and similar tables (pg_trigger_depth() > 1 when they
--     update profiles from inside another trigger)
--   * admins, who change is_admin through the admin UI
-- rewards_beta keeps its own guard from migration 129.
CREATE OR REPLACE FUNCTION guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL OR pg_trigger_depth() > 1 OR is_site_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.points IS DISTINCT FROM OLD.points
     OR NEW.spendable_points IS DISTINCT FROM OLD.spendable_points
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.hire_card_on_file IS DISTINCT FROM OLD.hire_card_on_file
     OR NEW.first_cleanup_bonus_claimed_at IS DISTINCT FROM OLD.first_cleanup_bonus_claimed_at
     OR NEW.first_checkin_bonus_claimed_at IS DISTINCT FROM OLD.first_checkin_bonus_claimed_at THEN
    RAISE EXCEPTION 'this profile field can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged_columns ON profiles;
CREATE TRIGGER profiles_guard_privileged_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_profile_privileged_columns();
