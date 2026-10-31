async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export type RouteLineString = {
  type: "LineString";
  coordinates: [number, number][];
};

export type RoutePhoto = {
  url: string;
  lat: number;
  lng: number;
  taken_at?: string | null;
};

export type IntersectingGeoUnit = {
  geo_unit_id: string;
  unit_id: string;
  display_name: string;
  active_multiplier: { multiplier: number; title: string } | null;
};

export async function getIntersectingGeoUnits({
  campaignId,
  route,
}: {
  campaignId: string;
  route: RouteLineString;
}): Promise<IntersectingGeoUnit[]> {
  return postJson<IntersectingGeoUnit[]>("/cleanup-routes/intersecting-geo-units", {
    campaign_id: campaignId,
    route,
  });
}

export type CleanupRouteDetailData = {
  id: string;
  campaign_id: string;
  campaign_title: string | null;
  campaign_slug: string | null;
  group_id: string | null;
  group_name: string | null;
  group_slug: string | null;
  group_logo_url: string | null;
  status: string;
  image_urls: string[];
  metrics_small_bags: number | null;
  metrics_large_bags: number | null;
  metrics_pounds: number | null;
  created_at: string | null;
  route: RouteLineString;
  route_distance_meters: number | null;
  route_photos: RoutePhoto[];
  geo_unit_display_name: string | null;
  submitted_by: {
    user_id: string | null;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
};

export async function getCleanupRoute(cleanupId: string): Promise<CleanupRouteDetailData> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/cleanup-routes/${cleanupId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CleanupRouteDetailData>;
}

export type CampaignCleanupRoute = {
  id: string;
  route: RouteLineString;
  route_photos: RoutePhoto[];
  group_id: string | null;
  group_name: string | null;
  group_logo_url: string | null;
  buffer: { type: "Polygon"; coordinates: number[][][] } | null;
};

export async function listCampaignCleanupRoutes(campaignId: string): Promise<CampaignCleanupRoute[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/cleanup-routes/campaign/${campaignId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<CampaignCleanupRoute[]>;
}

// Distance in meters from a point to the closest spot on a route polyline (0 if it lies
// on it). Mirrors the server's check-in proximity (ST_DWithin against the route), so the
// "X away" hint on the event page agrees with whether check-in will actually succeed.
// Uses a local equirectangular projection per segment: error is negligible at the
// sub-kilometer scales involved.
export function distanceToRouteMeters(
  lat: number,
  lng: number,
  coordinates: [number, number][],
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const cosLat = Math.cos(toRad(lat));
  // Project to meters relative to the query point, so the point is the origin.
  const project = ([cLng, cLat]: [number, number]) => ({
    x: toRad(cLng - lng) * cosLat * R,
    y: toRad(cLat - lat) * R,
  });
  if (coordinates.length === 0) return Infinity;
  let best = Infinity;
  let prev = project(coordinates[0]);
  best = Math.hypot(prev.x, prev.y);
  for (let i = 1; i < coordinates.length; i++) {
    const cur = project(coordinates[i]);
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(prev.x * dx + prev.y * dy) / lenSq));
    best = Math.min(best, Math.hypot(prev.x + t * dx, prev.y + t * dy));
    prev = cur;
  }
  return best;
}
