-- Job location can be a pin (location), a pin plus radius (radius_m), or a drawn area (area).
-- location stays the point used for distance sorting (the pin, or the area's centroid).
ALTER TABLE marketplace_jobs
  ADD COLUMN IF NOT EXISTS radius_m integer CHECK (radius_m IS NULL OR radius_m BETWEEN 10 AND 5000),
  ADD COLUMN IF NOT EXISTS area geography(Polygon, 4326);
