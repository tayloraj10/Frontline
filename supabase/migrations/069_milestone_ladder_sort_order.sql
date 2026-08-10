-- 068 inserted the milestone ladder rows without setting sort_order, so they all kept the
-- column's default of 0 — tied with each other and lower than every other category's explicit
-- sort_order (10-65), which meant Postgres returned them in arbitrary/insertion order instead of
-- grouped 1..X per ladder, and admin/page.tsx's `.order("sort_order")` sorted them ahead of every
-- other settings category instead of after. Assigns explicit values, each ladder grouped together
-- in ascending rung order, starting at 70 (after the existing max of 65) so the whole "Milestone
-- ladders" section renders at the bottom of the admin settings page.

UPDATE game_settings SET sort_order = v.sort_order FROM (VALUES
  ('points_milestone_1', 70),
  ('points_milestone_2', 71),
  ('points_milestone_3', 72),
  ('points_milestone_4', 73),
  ('points_milestone_5', 74),
  ('points_milestone_6', 75),

  ('contribution_count_milestone_1', 80),
  ('contribution_count_milestone_2', 81),
  ('contribution_count_milestone_3', 82),
  ('contribution_count_milestone_4', 83),
  ('contribution_count_milestone_5', 84),

  ('cleanup_bag_milestone_1', 90),
  ('cleanup_bag_milestone_2', 91),
  ('cleanup_bag_milestone_3', 92),
  ('cleanup_bag_milestone_4', 93),

  ('cleanup_pound_milestone_1', 100),
  ('cleanup_pound_milestone_2', 101),
  ('cleanup_pound_milestone_3', 102)
) AS v(key, sort_order)
WHERE game_settings.key = v.key;
