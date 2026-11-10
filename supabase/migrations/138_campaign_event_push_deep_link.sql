-- Hotspot / campaign-event notifications now carry a link_url that deep links to the
-- event on the campaign map: fly to its location and open its card (focus=<event id>).
-- send-push prefers link_url over campaign_slug, so pushes and the in-app bell both use it.
-- Location: the event's own point (bonus spots) when set, else its geo unit centroid.

CREATE OR REPLACE FUNCTION notify_contributors_of_campaign_event()
RETURNS TRIGGER AS $$
DECLARE
  v_slug text;
  v_lat double precision;
  v_lng double precision;
  v_link text;
BEGIN
  SELECT slug INTO v_slug FROM campaigns WHERE id = NEW.campaign_id;

  IF NEW.location IS NOT NULL THEN
    v_lat := ST_Y(NEW.location::geometry);
    v_lng := ST_X(NEW.location::geometry);
  ELSIF NEW.geo_unit_id IS NOT NULL THEN
    SELECT ST_Y(ST_Centroid(gu.geometry::geometry)), ST_X(ST_Centroid(gu.geometry::geometry))
      INTO v_lat, v_lng
      FROM geo_units gu WHERE gu.id = NEW.geo_unit_id;
  END IF;

  v_link := '/campaigns/' || v_slug || '?focus=' || NEW.id
    || CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
            THEN '&lat=' || v_lat || '&lng=' || v_lng || '&zoom=14'
            ELSE '' END;

  INSERT INTO user_notifications (user_id, type, title, body, campaign_id, campaign_slug, link_url)
  SELECT DISTINCT c.user_id, 'event', NEW.title, NEW.description, NEW.campaign_id, v_slug, v_link
  FROM contributions c
  WHERE c.campaign_id = NEW.campaign_id
    AND c.user_id IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
