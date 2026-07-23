-- Multi-group hosting for cleanup events. `cleanups.group_id` stays the primary/
-- creating host (unchanged everywhere it's already used); this table adds optional
-- additional co-hosting groups on top of it. Management of the co-host list is
-- restricted to the primary host's admins to keep one clear owner of the list.

CREATE TABLE cleanup_event_cohosts (
  cleanup_id uuid NOT NULL REFERENCES cleanups(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cleanup_id, group_id)
);

ALTER TABLE cleanup_event_cohosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cleanup_event_cohosts_select" ON cleanup_event_cohosts
  FOR SELECT USING (true);

CREATE POLICY "cleanup_event_cohosts_insert_primary_admin" ON cleanup_event_cohosts
  FOR INSERT WITH CHECK (
    is_group_admin((SELECT group_id FROM cleanups WHERE id = cleanup_id))
  );

CREATE POLICY "cleanup_event_cohosts_delete_primary_admin" ON cleanup_event_cohosts
  FOR DELETE USING (
    is_group_admin((SELECT group_id FROM cleanups WHERE id = cleanup_id))
  );
