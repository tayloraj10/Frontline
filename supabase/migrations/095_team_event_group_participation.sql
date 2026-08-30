-- Splits team-event participation into group-level opt-in (with a cascade setting) and
-- individual participation (optionally "representing" one group). See
-- dev-docs/team-events-phase2-scoping-2026-08-29.md section 1.

CREATE TABLE team_event_group_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_event_id UUID NOT NULL REFERENCES team_events(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES team_event_teams(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  -- cascade_all_members: every current + future (while active) member is auto-enrolled
  -- as an individual participant representing this group. individual_opt_in: the group's
  -- team choice is just a suggested default; members still opt in themselves.
  cascade_mode TEXT NOT NULL DEFAULT 'cascade_all_members' CHECK (cascade_mode IN ('cascade_all_members', 'individual_opt_in')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_event_id, group_id)
);

-- Individual participants can optionally represent one group they belong to. Team is
-- always that group's team while representing_group_id is set (enforced in app code,
-- since it depends on the group's row in team_event_group_participants).
ALTER TABLE team_event_participants ADD COLUMN representing_group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

-- Backfill: existing group-type rows become group opt-ins...
INSERT INTO team_event_group_participants (team_event_id, team_id, group_id, joined_at)
SELECT team_event_id, team_id, group_id, joined_at FROM team_event_participants WHERE participant_type = 'group';

-- ...and cascade down to their current members as individual rows (default cascade
-- mode), without clobbering anyone who already has their own individual row.
INSERT INTO team_event_participants (team_event_id, team_id, user_id, representing_group_id)
SELECT tep.team_event_id, tep.team_id, gm.user_id, tep.group_id
FROM team_event_participants tep
JOIN group_members gm ON gm.group_id = tep.group_id
WHERE tep.participant_type = 'group'
ON CONFLICT (team_event_id, user_id) WHERE user_id IS NOT NULL DO NOTHING;

DELETE FROM team_event_participants WHERE participant_type = 'group';

DROP INDEX team_event_participants_group_idx;
DROP INDEX team_event_participants_user_idx;
ALTER TABLE team_event_participants DROP CONSTRAINT team_event_participants_one_of;
ALTER TABLE team_event_participants ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE team_event_participants DROP COLUMN participant_type;
ALTER TABLE team_event_participants DROP COLUMN group_id;
ALTER TABLE team_event_participants ADD CONSTRAINT team_event_participants_user_unique UNIQUE (team_event_id, user_id);

ALTER TABLE team_event_group_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_event_group_participants_select" ON team_event_group_participants
  FOR SELECT USING (true);

-- Writes go through the FastAPI backend (service role); RLS here only gates direct
-- PostgREST access, mirroring the other team-event tables.
CREATE POLICY "team_event_group_participants_write" ON team_event_group_participants
  FOR ALL USING (is_site_admin()) WITH CHECK (is_site_admin());
