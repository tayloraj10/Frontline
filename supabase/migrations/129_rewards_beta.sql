-- Per-user beta access to the Earn, Hire and Impact pages before payments_enabled goes live.
-- Perks and every other payments-gated surface ignore this flag.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rewards_beta boolean NOT NULL DEFAULT false;

-- profiles_update lets users edit their own row, so lock this column to admins and the service role.
CREATE OR REPLACE FUNCTION guard_rewards_beta()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rewards_beta IS DISTINCT FROM OLD.rewards_beta
     AND auth.uid() IS NOT NULL
     AND NOT is_site_admin() THEN
    RAISE EXCEPTION 'rewards_beta can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_rewards_beta ON profiles;
CREATE TRIGGER profiles_guard_rewards_beta
  BEFORE UPDATE OF rewards_beta ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_rewards_beta();
