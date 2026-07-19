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
