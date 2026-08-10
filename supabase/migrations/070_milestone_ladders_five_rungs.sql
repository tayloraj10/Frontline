-- Rebalances all milestone ladders to a uniform 5 rungs (points/points_milestone_6 dropped;
-- cleanup_bag/cleanup_pound gain rungs), and lowers the points ladder's early rungs — 100 points
-- as a first milestone was steep given small_bag_value=1/large_bag_value=3/pound_value=0.5
-- (roughly 100 small-bag cleanups to reach it). contribution_count already had 5 rungs and is
-- left untouched.

DELETE FROM game_settings WHERE key = 'points_milestone_6';

UPDATE game_settings SET value = v.value FROM (VALUES
  ('points_milestone_1', 25),
  ('points_milestone_2', 100),
  ('points_milestone_3', 500),
  ('points_milestone_4', 1500),
  ('points_milestone_5', 5000),

  ('cleanup_bag_milestone_1', 10),
  ('cleanup_bag_milestone_2', 25),
  ('cleanup_bag_milestone_3', 50),
  ('cleanup_bag_milestone_4', 100),

  ('cleanup_pound_milestone_1', 100),
  ('cleanup_pound_milestone_2', 250),
  ('cleanup_pound_milestone_3', 500)
) AS v(key, value)
WHERE game_settings.key = v.key;

INSERT INTO game_settings (key, value, category, label, description, sort_order) VALUES
  ('cleanup_bag_milestone_5', 250, 'milestones', 'Bag count milestone 5', 'Ladder rung for the "you''ve collected N bags" per-campaign notification.', 94),
  ('cleanup_pound_milestone_4', 1000, 'milestones', 'Pound milestone 4', 'Ladder rung for the "you''ve cleaned N lbs" per-campaign notification.', 103),
  ('cleanup_pound_milestone_5', 2500, 'milestones', 'Pound milestone 5', 'Ladder rung for the "you''ve cleaned N lbs" per-campaign notification.', 104)
ON CONFLICT (key) DO NOTHING;
