// Tracks the last map position a user viewed for a given campaign, so "back to campaign"
// links can restore it via the same ?lat&lng&zoom deep-link mechanism used for map
// deep links (e.g. "Show on map" from an event page). sessionStorage rather than
// localStorage: this is "where you just were in this tab", not a durable preference.

export type SavedMapPosition = { lat: number; lng: number; zoom: number };

function mapPositionStorageKey(slug: string): string {
  return `frontline:map-position:${slug}`;
}

export function saveMapPosition(slug: string, position: SavedMapPosition) {
  try {
    window.sessionStorage.setItem(mapPositionStorageKey(slug), JSON.stringify(position));
  } catch {
    // sessionStorage unavailable (e.g. private browsing) — non-critical, skip silently
  }
}

export function readSavedMapPosition(slug: string): SavedMapPosition | null {
  try {
    const raw = window.sessionStorage.getItem(mapPositionStorageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedMapPosition>;
    if (typeof parsed.lat !== "number" || typeof parsed.lng !== "number" || typeof parsed.zoom !== "number") {
      return null;
    }
    return parsed as SavedMapPosition;
  } catch {
    return null;
  }
}

/** Builds a campaign URL carrying the saved position as a focusCoords-style deep link, if one exists. */
export function buildCampaignHrefWithSavedPosition(slug: string): string {
  const saved = readSavedMapPosition(slug);
  if (!saved) return `/campaigns/${slug}`;
  return `/campaigns/${slug}?lat=${saved.lat}&lng=${saved.lng}&zoom=${saved.zoom}`;
}
