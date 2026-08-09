-- Awards points for checking in to a group cleanup event (self check-in or organizer
-- check-in), as an attendance incentive separate from whatever cleanup the attendee
-- goes on to log. Admin-editable like the other point values.

INSERT INTO game_settings (key, value, category, label, description, sort_order) VALUES
  ('cleanup_event_checkin_value', 5, 'points', 'Cleanup event check-in value', 'Points awarded to an attendee when they check in to a group cleanup event (self check-in or organizer check-in). Awarded once per attendee per event.', 44);

-- 'cleanup_event_checkin' passes its value straight through, same as 'cleanup'/'photo' —
-- the caller (check-in endpoints) already resolves the value from
-- cleanup_event_checkin_value before inserting the contributions row.
CREATE OR REPLACE FUNCTION contribution_points(p_contribution_type TEXT, p_value NUMERIC)
RETURNS NUMERIC AS $$
  SELECT CASE p_contribution_type
    WHEN 'cleanup' THEN COALESCE(p_value, 0)
    WHEN 'photo' THEN COALESCE(p_value, 0)
    WHEN 'solarpunk_photo' THEN 1
    WHEN 'solarpunk_action' THEN 2
    WHEN 'solarpunk_hex_credit' THEN 0
    WHEN 'cleanup_event_checkin' THEN COALESCE(p_value, 0)
    ELSE 0
  END;
$$ LANGUAGE sql IMMUTABLE;
