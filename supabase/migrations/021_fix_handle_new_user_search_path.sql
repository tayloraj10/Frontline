-- handle_new_user() is SECURITY DEFINER and does an unqualified
-- `INSERT INTO profiles`, so it resolves via the *caller's* search_path at
-- invocation time. GoTrue's Postgres role (supabase_auth_admin) only sets
-- search_path=auth, so the trigger fails with "relation profiles does not
-- exist" when new auth users are created (discovered locally seeding demo
-- users; likely affects any environment where supabase_auth_admin lacks
-- public in its search_path).

ALTER FUNCTION public.handle_new_user() SET search_path = public;
