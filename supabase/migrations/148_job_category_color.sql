-- Accent color for each job category (a palette key, see frontend lib/categories.tsx),
-- plus the display order we expect by usage.
ALTER TABLE job_categories ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT 'emerald';

UPDATE job_categories SET
  color = CASE key
    WHEN 'litter' THEN 'orange'
    WHEN 'sidewalk' THEN 'slate'
    WHEN 'park_nature' THEN 'green'
    WHEN 'light_yard_work' THEN 'lime'
    WHEN 'lot_cleanup' THEN 'rose'
    WHEN 'storm_drain' THEN 'indigo'
    WHEN 'beach_lake' THEN 'yellow'
    WHEN 'snow_shoveling' THEN 'cyan'
    ELSE color END,
  sort_order = CASE key
    WHEN 'litter' THEN 10
    WHEN 'sidewalk' THEN 20
    WHEN 'park_nature' THEN 30
    WHEN 'light_yard_work' THEN 40
    WHEN 'lot_cleanup' THEN 50
    WHEN 'storm_drain' THEN 60
    WHEN 'beach_lake' THEN 70
    WHEN 'snow_shoveling' THEN 80
    ELSE sort_order END;
