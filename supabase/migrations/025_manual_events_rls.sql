-- Admins could update/delete campaign_events but never directly insert one — every
-- row came from a trigger firing (backend, bypasses RLS) or a seeder. This adds the
-- missing insert policy so the admin panel can spawn one-off area/duration/multiplier
-- events without needing a conditional trigger.

CREATE POLICY "campaign_events_insert" ON campaign_events
  FOR INSERT WITH CHECK (is_site_admin());
