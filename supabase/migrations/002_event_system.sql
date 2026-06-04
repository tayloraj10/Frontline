-- Event trigger definitions (per campaign)
CREATE TABLE event_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('threshold_reached', 'decay_elapsed', 'report_count', 'external_api', 'time_elapsed')),
  condition_config JSONB NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('boss_spawn', 'decay_start', 'cascade_unlock', 'seasonal_reset', 'notification')),
  effect_config JSONB NOT NULL,
  cooldown_hours INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE
);

-- Active / historical events
CREATE TABLE campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES event_triggers(id),
  geo_unit_id UUID REFERENCES geo_units(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  effect_config JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- Problem reports (feeds boss event triggers)
CREATE TABLE problem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  geo_unit_id UUID REFERENCES geo_units(id),
  reported_by UUID REFERENCES profiles(id),
  photo_url TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'addressed', 'verified')),
  reported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX problem_reports_location_idx ON problem_reports USING GIST (location);

-- Enable Realtime on hot tables
ALTER PUBLICATION supabase_realtime ADD TABLE contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE territory_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_events;
ALTER PUBLICATION supabase_realtime ADD TABLE leaderboard_entries;
