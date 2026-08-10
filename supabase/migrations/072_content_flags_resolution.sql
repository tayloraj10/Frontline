-- Adds resolution tracking to content_flags so an admin queue can list only
-- unresolved (content_type, content_id, photo_url) groups and record how each
-- was handled (hidden vs dismissed as not-actionable).

ALTER TABLE content_flags ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE content_flags ADD COLUMN resolved_by UUID REFERENCES profiles(id);
ALTER TABLE content_flags ADD COLUMN resolution TEXT CHECK (resolution IN ('hidden', 'dismissed'));

CREATE INDEX content_flags_unresolved_idx ON content_flags(content_type, content_id, photo_url) WHERE resolved_at IS NULL;
