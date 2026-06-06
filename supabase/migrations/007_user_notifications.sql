-- User-scoped notification inbox
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'event', -- 'event' | 'tract_claimed' | 'milestone'
  title TEXT NOT NULL,
  body TEXT,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_slug TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX user_notifications_user_created_idx ON user_notifications(user_id, created_at DESC);
CREATE INDEX user_notifications_unread_idx ON user_notifications(user_id, read) WHERE read = FALSE;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_notifications" ON user_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_notifications" ON user_notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Backend (service_role) and Postgres triggers bypass RLS anyway, but be explicit
CREATE POLICY "service_insert_notifications" ON user_notifications
  FOR INSERT WITH CHECK (true);

-- When a campaign_event is inserted, notify all users who have contributed to that campaign
CREATE OR REPLACE FUNCTION notify_contributors_of_campaign_event()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug)
  SELECT DISTINCT
    c.user_id,
    'event',
    NEW.title,
    NEW.description,
    NEW.campaign_id,
    camps.slug
  FROM contributions c
  JOIN campaigns camps ON camps.id = c.campaign_id
  WHERE c.campaign_id = NEW.campaign_id
    AND c.user_id IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_campaign_event_insert
  AFTER INSERT ON campaign_events
  FOR EACH ROW
  EXECUTE FUNCTION notify_contributors_of_campaign_event();

-- When territory_claims changes ownership, notify the new claimant
CREATE OR REPLACE FUNCTION notify_territory_claimed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.claimed_by_user IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.claimed_by_user IS DISTINCT FROM NEW.claimed_by_user) THEN
    INSERT INTO user_notifications (user_id, type, title, campaign_id, campaign_slug)
    SELECT
      NEW.claimed_by_user,
      'tract_claimed',
      'You claimed a territory',
      NEW.campaign_id,
      camps.slug
    FROM campaigns camps
    WHERE camps.id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_territory_claimed
  AFTER INSERT OR UPDATE ON territory_claims
  FOR EACH ROW
  EXECUTE FUNCTION notify_territory_claimed();
