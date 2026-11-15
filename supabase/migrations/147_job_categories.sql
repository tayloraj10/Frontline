-- Job categories (what kind of cleanup a job is), editable from admin Settings.
-- Replaces the hard-coded type lists. job_type on jobs stays plain text and points at job_categories.key.
CREATE TABLE IF NOT EXISTS job_categories (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text NOT NULL,
  short_label text NOT NULL,
  icon text NOT NULL DEFAULT 'sparkles',
  description text NOT NULL DEFAULT '',
  rule_note text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  bags_required boolean NOT NULL DEFAULT true,
  after_photo_required boolean NOT NULL DEFAULT true,
  requires_permission boolean NOT NULL DEFAULT false,
  hazard_risk boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_categories_read ON job_categories;
CREATE POLICY job_categories_read ON job_categories FOR SELECT USING (true);

INSERT INTO job_categories
  (key, label, short_label, icon, description, rule_note, sort_order, bags_required, after_photo_required, requires_permission) VALUES
  ('litter', 'Litter pickup', 'Litter', 'trash', 'Picking up loose trash and small debris from streets, sidewalks and open ground.', '', 10, true, true, false),
  ('sidewalk', 'Sidewalk and curb', 'Sidewalk', 'footprints', 'Clearing trash, weeds and debris from a sidewalk, curb line or gutter edge.', '', 20, true, true, false),
  ('light_yard_work', 'Yard cleanup', 'Yard', 'sprout', 'Trash or leaves in your own yard. Not general yard work like mowing or trimming.', 'Not for mowing, trimming or other general yard work.', 30, true, true, false),
  ('snow_shoveling', 'Snow shoveling', 'Snow', 'snowflake', 'Shoveling snow from a walkway, steps or driveway.', 'No bags are needed for this type.', 40, false, true, false),
  ('park_nature', 'Nature', 'Nature', 'tree', 'Parks, hiking trails, gardens and tree beds, including grassy or uneven ground.', 'Confirm you own the land or have permission.', 50, true, true, true),
  ('beach_lake', 'Beach and lake', 'Beach', 'waves', 'Dry, walkable beach or lakeside ground. Not the water, rocks or steep shoreline.', 'Dry, walkable ground only. Confirm you have permission.', 60, true, true, true),
  ('storm_drain', 'Storm drain and grate', 'Drain', 'grid', 'Clearing leaves, trash and debris from a storm drain or grate. Bag what you pull out.', 'Stay out of the road and never lift a grate.', 70, true, false, false),
  ('lot_cleanup', 'Lot or vacant land', 'Lot', 'fence', 'Trash on a vacant lot or empty land.', 'Confirm you own the land or have permission.', 80, true, true, true)
ON CONFLICT (key) DO NOTHING;
