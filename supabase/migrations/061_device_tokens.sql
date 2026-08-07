-- Push notification device tokens (FCM registration tokens for both iOS and Android,
-- since push is routed entirely through FCM — see push-notifications-scoping-2026-08-06.md)
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'ios' | 'android'
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (token)
);

CREATE INDEX device_tokens_user_idx ON device_tokens(user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_device_tokens" ON device_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Backend (service_role) bypasses RLS anyway, but be explicit
CREATE POLICY "service_manage_device_tokens" ON device_tokens
  FOR ALL USING (true) WITH CHECK (true);
