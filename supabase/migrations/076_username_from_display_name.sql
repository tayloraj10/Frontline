-- Social logins (Google, Apple web OAuth) populate raw_user_meta_data.full_name/name
-- but never a "username" claim, so handle_new_user() previously always fell back to
-- the email local-part -- e.g. an Apple private-relay address like "7jgy4w9fcr" shown
-- throughout the app instead of anything resembling the user's name.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  candidate TEXT;
  suffix INT := 0;
BEGIN
  base_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'username', ''),
    NULLIF(regexp_replace(lower(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), '[^a-z0-9]+', '', 'g'), ''),
    split_part(NEW.email, '@', 1)
  );

  candidate := base_username;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = candidate) LOOP
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  END LOOP;

  INSERT INTO profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    candidate,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
