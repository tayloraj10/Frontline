-- Team-vs-team competition events. Generic "team" concept (not hardcoded to any two
-- cities) so any future team-vs-team competition reuses these tables.

CREATE TABLE team_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  submission_mode TEXT NOT NULL DEFAULT 'manual_opt_in' CHECK (submission_mode IN ('automatic', 'manual_opt_in')),
  requires_photo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_event_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_event_id UUID NOT NULL REFERENCES team_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Boundary polygon for the automatic-mode geo check, once city-limits geo data is
  -- loaded (Phase 3, deferred). NULL means "no boundary loaded yet" — automatic mode
  -- degrades to active+membership-only for that team until this is set.
  geo_unit_id UUID REFERENCES geo_units(id),
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_event_id, name)
);

CREATE TABLE team_event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_event_id UUID NOT NULL REFERENCES team_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES team_event_teams(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('user', 'group')),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_event_participants_one_of CHECK (
    (participant_type = 'user' AND user_id IS NOT NULL AND group_id IS NULL)
    OR (participant_type = 'group' AND group_id IS NOT NULL AND user_id IS NULL)
  )
);

-- A participant/group belongs to exactly one team per event; switching teams updates
-- this row rather than inserting a second one.
CREATE UNIQUE INDEX team_event_participants_user_idx ON team_event_participants(team_event_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX team_event_participants_group_idx ON team_event_participants(team_event_id, group_id) WHERE group_id IS NOT NULL;

-- Event-scoped delegated managers, mirrors cleanup_rsvps.is_organizer — lets an
-- event_manager hand day-to-day review off without granting the global role.
CREATE TABLE team_event_organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_event_id UUID NOT NULL REFERENCES team_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_event_id, user_id)
);

-- Audit log for reviewer edits to a submission's metrics, mirrors cleanup_team_total_logs.
CREATE TABLE team_event_submission_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id UUID NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  edited_by UUID REFERENCES profiles(id),
  previous_small_bags INTEGER,
  previous_large_bags INTEGER,
  previous_pounds NUMERIC,
  previous_value NUMERIC,
  previous_review_status TEXT,
  new_small_bags INTEGER,
  new_large_bags INTEGER,
  new_pounds NUMERIC,
  new_value NUMERIC,
  new_review_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mirrors the existing cleanup_id vs cleanup_event_id FK separation (see migration 039):
-- a submission's underlying cleanup row is distinct from which competition it counts
-- toward. team_event_team_id is always resolved server-side from the participant's
-- team at submit time, never client-supplied.
ALTER TABLE contributions ADD COLUMN team_event_id UUID REFERENCES team_events(id) ON DELETE SET NULL;
ALTER TABLE contributions ADD COLUMN team_event_team_id UUID REFERENCES team_event_teams(id) ON DELETE SET NULL;
ALTER TABLE contributions ADD COLUMN review_status TEXT CHECK (review_status IN ('pending', 'approved', 'flagged'));

CREATE INDEX contributions_team_event_id_idx ON contributions(team_event_id) WHERE team_event_id IS NOT NULL;

ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_event_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_event_organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_event_submission_edits ENABLE ROW LEVEL SECURITY;

-- Public read for anything but draft events (draft is only visible via the backend's
-- own event_manager-gated routes, which use the service role and bypass RLS).
CREATE POLICY "team_events_select" ON team_events
  FOR SELECT USING (status != 'draft' OR is_site_admin());

CREATE POLICY "team_event_teams_select" ON team_event_teams
  FOR SELECT USING (true);

CREATE POLICY "team_event_participants_select" ON team_event_participants
  FOR SELECT USING (true);

CREATE POLICY "team_event_organizers_select" ON team_event_organizers
  FOR SELECT USING (true);

-- All writes to these tables go through the FastAPI backend (service role), which
-- enforces event_manager / organizer checks in application code — mirrors how
-- cleanup_events writes are handled today. RLS here only needs to gate direct
-- PostgREST access, which none of this feature uses.
CREATE POLICY "team_events_write" ON team_events
  FOR ALL USING (is_site_admin()) WITH CHECK (is_site_admin());

CREATE POLICY "team_event_submission_edits_select" ON team_event_submission_edits
  FOR SELECT USING (is_site_admin());
