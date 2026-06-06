-- Admin role: add is_admin flag to profiles + write policies for admin-only tables

ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Helper function so RLS policies can call is_site_admin() without a subquery each time.
-- SECURITY DEFINER + STABLE so Postgres can cache the result within a transaction.
CREATE OR REPLACE FUNCTION is_site_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Allow admins to update any profile (e.g. grant/revoke is_admin)
CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE USING (is_site_admin());

-- Campaigns: admins can create / update / delete
CREATE POLICY "campaigns_insert" ON campaigns
  FOR INSERT WITH CHECK (is_site_admin());

CREATE POLICY "campaigns_update" ON campaigns
  FOR UPDATE USING (is_site_admin());

CREATE POLICY "campaigns_delete" ON campaigns
  FOR DELETE USING (is_site_admin());

-- Geo units: admins can create / update / delete
CREATE POLICY "geo_units_insert" ON geo_units
  FOR INSERT WITH CHECK (is_site_admin());

CREATE POLICY "geo_units_update" ON geo_units
  FOR UPDATE USING (is_site_admin());

CREATE POLICY "geo_units_delete" ON geo_units
  FOR DELETE USING (is_site_admin());

-- Event triggers: admins have full access
ALTER TABLE event_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_triggers_select" ON event_triggers
  FOR SELECT USING (true);

CREATE POLICY "event_triggers_insert" ON event_triggers
  FOR INSERT WITH CHECK (is_site_admin());

CREATE POLICY "event_triggers_update" ON event_triggers
  FOR UPDATE USING (is_site_admin());

CREATE POLICY "event_triggers_delete" ON event_triggers
  FOR DELETE USING (is_site_admin());

-- Campaign events: admins can update (resolve) and delete
CREATE POLICY "campaign_events_update" ON campaign_events
  FOR UPDATE USING (is_site_admin());

CREATE POLICY "campaign_events_delete" ON campaign_events
  FOR DELETE USING (is_site_admin());
