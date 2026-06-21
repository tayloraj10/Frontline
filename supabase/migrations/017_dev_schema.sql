-- Dev/prod data isolation: mirror the 9 "user-generated" tables into a `dev`
-- schema so seeded/test data never mixes with production rows. Reference
-- tables (geo_units, campaigns, event_triggers, profiles) stay shared in
-- `public` only — see plan notes for why profiles is excluded (no real
-- signup flow needed in dev; a handful of test users live in public.profiles).
--
-- Backend selects dev vs public via connection search_path (ENVIRONMENT).
-- Frontend selects via supabase-js db.schema, driven by NEXT_PUBLIC_DB_SCHEMA.

CREATE SCHEMA IF NOT EXISTS dev;

-- ── groups ──────────────────────────────────────────────────────────────────
CREATE TABLE dev.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  image_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  social_links JSONB DEFAULT '{}'::jsonb,
  categories TEXT[] DEFAULT '{}',
  featured BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── group_members ───────────────────────────────────────────────────────────
CREATE TABLE dev.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES dev.groups(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

-- ── contributions ───────────────────────────────────────────────────────────
CREATE TABLE dev.contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  group_id UUID REFERENCES dev.groups(id),
  geo_unit_id UUID REFERENCES public.geo_units(id),
  contribution_type TEXT NOT NULL,
  value NUMERIC,
  photo_url TEXT,
  location GEOGRAPHY(POINT, 4326),
  location_verified BOOLEAN DEFAULT FALSE,
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  cleanup_id UUID
);

-- ── cleanups ─────────────────────────────────────────────────────────────────
CREATE TABLE dev.cleanups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id),
  geo_unit_id UUID REFERENCES public.geo_units(id),
  title TEXT NOT NULL DEFAULT 'Cleanup',
  description TEXT,
  location GEOGRAPHY(POINT, 4326),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  status TEXT DEFAULT 'completed'
    CHECK (status IN ('open', 'scheduled', 'in_progress', 'completed', 'addressed', 'verified', 'cancelled')),
  image_urls TEXT[] DEFAULT '{}',
  metrics_small_bags INT,
  metrics_large_bags INT,
  metrics_pounds NUMERIC,
  submitted_by_user_id UUID REFERENCES public.profiles(id),
  organizer_user_ids UUID[] DEFAULT '{}',
  rsvp_user_ids UUID[] DEFAULT '{}',
  attended_user_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dev.contributions
  ADD CONSTRAINT contributions_cleanup_id_fkey
  FOREIGN KEY (cleanup_id) REFERENCES dev.cleanups(id) ON DELETE SET NULL;

-- ── territory_claims ─────────────────────────────────────────────────────────
CREATE TABLE dev.territory_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  geo_unit_id UUID REFERENCES public.geo_units(id),
  claimed_by_user UUID REFERENCES public.profiles(id),
  claimed_by_group UUID REFERENCES dev.groups(id),
  total_value NUMERIC DEFAULT 0,
  last_contribution_at TIMESTAMPTZ,
  decay_starts_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, geo_unit_id)
);

-- ── campaign_events ───────────────────────────────────────────────────────────
CREATE TABLE dev.campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES public.event_triggers(id),
  geo_unit_id UUID REFERENCES public.geo_units(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  effect_config JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'resolved', 'expired')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

-- ── problem_reports ───────────────────────────────────────────────────────────
CREATE TABLE dev.problem_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id),
  geo_unit_id UUID REFERENCES public.geo_units(id),
  submitted_by_user_id UUID REFERENCES public.profiles(id),
  image_urls TEXT[] DEFAULT '{}',
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'scheduled', 'in_progress', 'completed', 'addressed', 'verified', 'cancelled')),
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_by_user_id UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolved_by_cleanup_id UUID REFERENCES dev.cleanups(id) ON DELETE SET NULL
);

-- ── leaderboard_entries ───────────────────────────────────────────────────────
CREATE TABLE dev.leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'group')),
  entity_id UUID NOT NULL,
  rank INT,
  total_value NUMERIC DEFAULT 0,
  contribution_count INT DEFAULT 0,
  tracts_claimed INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── user_notifications ────────────────────────────────────────────────────────
CREATE TABLE dev.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL DEFAULT 'event',
  title TEXT NOT NULL,
  body TEXT,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  campaign_slug TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes (mirrors 001, 002, 007, 009, 016) ─────────────────────────────────
CREATE INDEX dev_contributions_location_idx ON dev.contributions USING GIST (location);
CREATE INDEX dev_contributions_campaign_id_idx ON dev.contributions (campaign_id);
CREATE INDEX dev_contributions_user_id_idx ON dev.contributions (user_id);
CREATE INDEX dev_contributions_submitted_at_idx ON dev.contributions (submitted_at DESC);

CREATE INDEX dev_cleanups_location_idx ON dev.cleanups USING GIST (location);

CREATE INDEX dev_territory_claims_campaign_id_idx ON dev.territory_claims (campaign_id);
CREATE INDEX dev_territory_claims_claimed_by_user_idx ON dev.territory_claims (claimed_by_user);
CREATE INDEX dev_territory_claims_claimed_by_group_idx ON dev.territory_claims (claimed_by_group);

CREATE INDEX dev_problem_reports_location_idx ON dev.problem_reports USING GIST (location);

CREATE INDEX dev_group_members_user_id_idx ON dev.group_members (user_id);
CREATE INDEX dev_group_members_group_id_idx ON dev.group_members (group_id);

CREATE INDEX dev_user_notifications_user_created_idx ON dev.user_notifications (user_id, created_at DESC);
CREATE INDEX dev_user_notifications_unread_idx ON dev.user_notifications (user_id, read) WHERE read = FALSE;

-- ── RLS (mirrors 003, 007, 008, 015, 016) ─────────────────────────────────────
ALTER TABLE dev.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.cleanups ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.territory_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.problem_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select" ON dev.groups FOR SELECT USING (true);
CREATE POLICY "groups_insert" ON dev.groups FOR INSERT WITH CHECK (
  auth.uid() = created_by OR public.is_site_admin()
);
CREATE POLICY "groups_update" ON dev.groups FOR UPDATE USING (
  auth.uid() = created_by OR
  EXISTS (
    SELECT 1 FROM dev.group_members
    WHERE group_id = dev.groups.id AND user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "group_members_select" ON dev.group_members FOR SELECT USING (true);
CREATE POLICY "group_members_insert" ON dev.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_members_delete" ON dev.group_members FOR DELETE USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM dev.group_members gm
    WHERE gm.group_id = dev.group_members.group_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
  )
);

CREATE POLICY "contributions_select" ON dev.contributions FOR SELECT USING (true);
CREATE POLICY "contributions_insert" ON dev.contributions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cleanups_select" ON dev.cleanups FOR SELECT USING (true);
CREATE POLICY "cleanups_insert" ON dev.cleanups FOR INSERT WITH CHECK (auth.uid() = submitted_by_user_id);

CREATE POLICY "territory_claims_select" ON dev.territory_claims FOR SELECT USING (true);

CREATE POLICY "leaderboard_select" ON dev.leaderboard_entries FOR SELECT USING (true);

CREATE POLICY "campaign_events_select" ON dev.campaign_events FOR SELECT USING (true);
CREATE POLICY "campaign_events_update" ON dev.campaign_events FOR UPDATE USING (public.is_site_admin());
CREATE POLICY "campaign_events_delete" ON dev.campaign_events FOR DELETE USING (public.is_site_admin());

CREATE POLICY "problem_reports_select" ON dev.problem_reports FOR SELECT USING (true);
CREATE POLICY "problem_reports_insert" ON dev.problem_reports FOR INSERT WITH CHECK (auth.uid() = submitted_by_user_id);

CREATE POLICY "users_read_own_notifications" ON dev.user_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_update_own_notifications" ON dev.user_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "service_insert_notifications" ON dev.user_notifications FOR INSERT WITH CHECK (true);

-- ── Triggers (reuse existing public functions — see 007_user_notifications.sql) ─
CREATE TRIGGER on_campaign_event_insert
  AFTER INSERT ON dev.campaign_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_contributors_of_campaign_event();

CREATE TRIGGER on_territory_claimed
  AFTER INSERT OR UPDATE ON dev.territory_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_territory_claimed();

-- ── Realtime (mirrors 002_event_system.sql) ───────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE dev.contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE dev.territory_claims;
ALTER PUBLICATION supabase_realtime ADD TABLE dev.campaign_events;
ALTER PUBLICATION supabase_realtime ADD TABLE dev.leaderboard_entries;
