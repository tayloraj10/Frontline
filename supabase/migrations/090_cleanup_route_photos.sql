-- Adds per-photo coordinates to routed cleanups so photos taken during live route
-- tracking can render as individual icon markers along the route, instead of only
-- a flat end-of-route photo gallery with no positional data.
-- JSONB array (not a child table) mirrors how `route` itself is one denormalized
-- geometry column per cleanup row. Photos are NOT indexed against route.coordinates:
-- each entry carries its own independent lat/lng captured at press-time, so editing
-- route vertices in the review step never desyncs a photo's position.
ALTER TABLE cleanups ADD COLUMN route_photos jsonb;

COMMENT ON COLUMN cleanups.route_photos IS
  'Array of {url, lat, lng, taken_at} for photos captured during live route tracking, '
  'each with its own coordinate independent of route.coordinates. NULL/empty for '
  'non-route cleanups or routes with no in-tracking photos (end-of-route flat photos '
  'still live in image_urls only, with no coordinate).';
