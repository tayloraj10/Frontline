-- Granular bag-type tracking + countable small items (cigarette butts, etc.) +
-- points-basis choice for individual self-logged cleanups. See
-- dev-docs/granular-bag-tracking-scoping-2026-09-02.md for the full design.
--
-- Static admin-editable lookup rows are seeded directly here via
-- INSERT ... ON CONFLICT DO NOTHING, matching the precedent set by
-- 068_admin_editable_milestone_ladders.sql (not a Seeder-registry class --
-- that registry is scoped to campaign/geo_unit boundary-data seeding).

CREATE TABLE bag_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  size_class text NOT NULL CHECK (size_class IN ('small', 'large')),
  point_value numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE countable_item_types (
  key text PRIMARY KEY,
  label text NOT NULL,
  unit_count int NOT NULL,
  points_per_unit numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE cleanups ADD COLUMN metrics_detail jsonb;

INSERT INTO bag_types (key, label, size_class, point_value, sort_order, active) VALUES
  ('utility_bucket_5gal', 'Standard utility bucket (5 gal)', 'small', 1, 10, true),
  ('grocery_plastic', 'Grocery store plastic bag (2-3 gal)', 'small', 1, 20, true),
  ('grocery_paper', 'Grocery store paper bag (4-5 gal)', 'small', 1, 30, true),
  ('kitchen_13gal', 'Standard kitchen-sized plastic bag (13 gal)', 'large', 3, 40, true),
  ('large_plastic_30gal', 'Large plastic garbage bag (30 gal)', 'large', 3, 50, true),
  ('large_paper_lawn_30gal', 'Large brown paper lawn bag (30 gal)', 'large', 3, 60, true),
  ('contractor_40_80gal', 'Contractor/landscaping bag (40-80 gal)', 'large', 4, 70, true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO countable_item_types (key, label, unit_count, points_per_unit, sort_order, active) VALUES
  ('cigarette_butt', 'Cigarette butts', 20, 1, 10, true),
  ('bottle_cap', 'Bottle caps', 20, 1, 20, false),
  ('straw', 'Straws', 20, 1, 30, false),
  ('vape_pod', 'Vape pods / cartridges', 20, 1, 40, false),
  ('nip_bottle', 'Nip / mini liquor bottles', 20, 1, 50, false),
  ('styrofoam_piece', 'Styrofoam pieces', 20, 1, 60, false)
ON CONFLICT (key) DO NOTHING;
