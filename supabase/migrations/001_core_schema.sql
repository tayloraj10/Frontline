-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  total_contributions INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Groups (orgs, clubs, movements)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group membership
CREATE TABLE group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('territory', 'collage', 'choropleth', 'heatmap')),
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('cleanup', 'photo', 'registration', 'advocacy')),
  geo_scope JSONB,
  geo_unit TEXT CHECK (geo_unit IN ('census_tract', 'zip', 'state', 'point')),
  win_condition JSONB,
  scoring_rules JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'paused')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geographic units (census tracts, states, etc.)
CREATE TABLE geo_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  geometry GEOMETRY(MULTIPOLYGON, 4326) NOT NULL,
  geojson JSONB,
  display_name TEXT,
  UNIQUE(campaign_id, unit_id)
);

-- Contributions (core action log)
CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  group_id UUID REFERENCES groups(id),
  geo_unit_id UUID REFERENCES geo_units(id),
  contribution_type TEXT NOT NULL,
  value NUMERIC,
  photo_url TEXT,
  location GEOGRAPHY(POINT, 4326),
  location_verified BOOLEAN DEFAULT FALSE,
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

-- Territory claims (derived async from contributions)
CREATE TABLE territory_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  geo_unit_id UUID REFERENCES geo_units(id),
  claimed_by_user UUID REFERENCES profiles(id),
  claimed_by_group UUID REFERENCES groups(id),
  total_value NUMERIC DEFAULT 0,
  last_contribution_at TIMESTAMPTZ,
  decay_starts_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, geo_unit_id)
);

-- Campaign leaderboards (periodically refreshed)
CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'group')),
  entity_id UUID NOT NULL,
  rank INT,
  total_value NUMERIC DEFAULT 0,
  contribution_count INT DEFAULT 0,
  tracts_claimed INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial indexes
CREATE INDEX geo_units_geometry_idx ON geo_units USING GIST (geometry);
CREATE INDEX contributions_location_idx ON contributions USING GIST (location);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
