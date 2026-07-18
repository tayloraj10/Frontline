-- Shared foundation for three additive features: group-hosted cleanup events with
-- RSVP/attendance, cleanup routes (polylines), and a toggleable NYC neighborhoods
-- overlay. All schema ships in one migration since it's pure additive DDL (new
-- nullable columns/tables), but only the neighborhoods slice (geo_unit_adjacency) is
-- exercised by Phase 1 — the rest stays dormant until Phase 2/3 land.

-- Mirrors is_business_admin() from 033_partner_business_admins.sql so it can be used
-- the same way inside RLS policies.
CREATE OR REPLACE FUNCTION is_group_admin(target_group_id uuid)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = target_group_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Feature 1 + 2: cleanups gains event/route capability
-- (geo_unit_id already exists on cleanups from an earlier migration — the zip-scoring
-- path already links a cleanup to the geo_unit it was scored against.)
ALTER TABLE cleanups ADD COLUMN group_id uuid REFERENCES groups(id) ON DELETE SET NULL;
ALTER TABLE cleanups ADD COLUMN is_group_event boolean NOT NULL DEFAULT false;
ALTER TABLE cleanups ADD COLUMN join_code text UNIQUE;
ALTER TABLE cleanups ADD COLUMN route GEOGRAPHY(LINESTRING, 4326);

-- Feature 1: RSVP/attendance, one row per (cleanup, user)
CREATE TABLE cleanup_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_id uuid NOT NULL REFERENCES cleanups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'maybe', 'cancelled')),
  checked_in_at timestamptz,
  contribution_id uuid REFERENCES contributions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cleanup_id, user_id)
);

ALTER TABLE cleanup_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cleanup_rsvps_select" ON cleanup_rsvps
  FOR SELECT USING (true);
CREATE POLICY "cleanup_rsvps_insert_self" ON cleanup_rsvps
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "cleanup_rsvps_update_self" ON cleanup_rsvps
  FOR UPDATE USING (user_id = auth.uid());
-- Additive: lets an event organizer check an attendee in (e.g. via join code) without
-- needing the attendee's own session. Does not affect the self-update policy above.
CREATE POLICY "cleanup_rsvps_update_organizer" ON cleanup_rsvps
  FOR UPDATE USING (
    is_group_admin((SELECT group_id FROM cleanups WHERE id = cleanup_id))
  );

-- Live RSVP count / attendee list on the event detail page.
ALTER PUBLICATION supabase_realtime ADD TABLE cleanup_rsvps;

-- Feature 1: audit trail for organizer-logged-on-behalf-of contributions
ALTER TABLE contributions ADD COLUMN recorded_by_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Additive INSERT policy alongside the existing self-submit one: an organizer may
-- insert a contribution on an attendee's behalf, but only for a cleanup tied to a
-- group they administer, and only when recorded_by_user_id is their own uid.
CREATE POLICY "contributions_insert_organizer_for_attendee" ON contributions
  FOR INSERT WITH CHECK (
    recorded_by_user_id = auth.uid()
    AND cleanup_id IS NOT NULL
    AND is_group_admin((SELECT group_id FROM cleanups WHERE id = cleanup_id))
  );

-- Feature 3: adjacency graph for client-side "no two touching polygons share a color"
-- coloring. Populated per-unit_type by that type's seeder (nyc_neighborhoods.py is
-- the first). Directed pair per edge (both directions stored) for a simple lookup.
CREATE TABLE geo_unit_adjacency (
  geo_unit_id uuid NOT NULL REFERENCES geo_units(id) ON DELETE CASCADE,
  adjacent_geo_unit_id uuid NOT NULL REFERENCES geo_units(id) ON DELETE CASCADE,
  PRIMARY KEY (geo_unit_id, adjacent_geo_unit_id)
);
