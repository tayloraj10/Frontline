-- Generic report/flag mechanic for user-generated photos outside problem_reports
-- (which already has its own problem_report_flags table). Covers: contribution
-- photos shown on the map, cleanup-event gallery photos (both the standalone
-- cleanup_event_photos rows and the contribution-derived cleanups.image_urls
-- entries), and profile avatars.
--
-- content_id/photo_url interpretation by content_type:
--   contribution_photo  -> content_id = contributions.id,      photo_url = contributions.photo_url
--   cleanup_log_photo   -> content_id = cleanups.id,            photo_url = one entry of cleanups.image_urls
--   cleanup_event_photo -> content_id = cleanup_event_photos.id, photo_url = its photo_url
--   avatar               -> content_id = profiles.id,            photo_url = profiles.avatar_url
-- photo_url is stored (not just content_id) because cleanup_log_photo has no
-- per-photo primary key of its own -- the array entry is only addressable by
-- its parent row id plus its own URL.

CREATE TABLE content_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN (
    'contribution_photo', 'cleanup_log_photo', 'cleanup_event_photo', 'avatar'
  )),
  content_id UUID NOT NULL,
  photo_url TEXT NOT NULL,
  flagged_by_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_type, content_id, photo_url, flagged_by_user_id)
);

CREATE INDEX content_flags_lookup_idx ON content_flags(content_type, content_id, photo_url);

ALTER TABLE content_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_flags_select" ON content_flags FOR SELECT USING (true);
CREATE POLICY "content_flags_insert" ON content_flags FOR INSERT WITH CHECK (auth.uid() = flagged_by_user_id);
