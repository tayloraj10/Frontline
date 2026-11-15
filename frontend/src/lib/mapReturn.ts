import type maplibregl from "maplibre-gl";

/**
 * Before a map popup sends the user to another page, write the camera into the current URL
 * (?lat=&lng=&zoom=, the same params the campaign page already turns into focusCoords).
 * The browser's Back button then lands on a URL that restores this view.
 */
export function saveMapReturn(map: maplibregl.Map | null | undefined) {
  if (!map) return;
  try {
    const url = new URL(window.location.href);
    if (!url.pathname.startsWith("/campaigns/")) return;
    const c = map.getCenter();
    url.searchParams.set("lat", c.lat.toFixed(5));
    url.searchParams.set("lng", c.lng.toFixed(5));
    url.searchParams.set("zoom", map.getZoom().toFixed(2));
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {}
}
