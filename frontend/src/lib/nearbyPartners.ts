import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type NearbyPartnerOffer = {
  id: string;
  title: string;
  description: string | null;
  event_redemption_limit: number | null;
};

export type NearbyPartner = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website_url: string | null;
  social_links: Record<string, string> | null;
  locationLabel: string | null;
  distanceMeters: number;
  eventOffers: NearbyPartnerOffer[];
};

const EARTH_RADIUS_METERS = 6371000;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type LocationRow = {
  lat: number;
  lng: number;
  label: string | null;
  city: string | null;
  state: string | null;
  status: string;
};

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  website_url: string | null;
  social_links: Record<string, string> | null;
  partner_business_locations: LocationRow[];
};

// Reads only active businesses/locations (same RLS-visible set as the public partner
// directory), then does the distance filtering client-side rather than via a PostGIS
// RPC -- fine at current partner-count scale, and matches how /partners already fetches
// this table (see frontend/src/app/partners/page.tsx).
//
// eventPoints is every point that should count as "at this cleanup" -- for a single-point
// cleanup that's just the one pin, for a route it's every vertex the organizer drew, so a
// business near the middle or end of a long route still gets picked up, not just one near
// the start. Distance is the closest of those points to each business location.
export async function getNearbyPartners(
  eventPoints: { lat: number; lng: number }[],
  radiusMeters = 805,
  limit = 5
): Promise<NearbyPartner[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("public")
    .from("partner_businesses")
    .select(
      "id, name, slug, logo_url, website_url, social_links, partner_business_locations(lat, lng, label, city, state, status)"
    )
    .eq("status", "active");

  if (error || !data || eventPoints.length === 0) return [];

  const results: NearbyPartner[] = [];
  for (const business of data as unknown as BusinessRow[]) {
    let closest: { distance: number; location: LocationRow } | null = null;
    for (const location of business.partner_business_locations ?? []) {
      if (location.status !== "active") continue;
      let distance = Infinity;
      for (const point of eventPoints) {
        const d = haversineMeters(point.lat, point.lng, location.lat, location.lng);
        if (d < distance) distance = d;
      }
      if (!closest || distance < closest.distance) closest = { distance, location };
    }
    if (!closest || closest.distance > radiusMeters) continue;
    results.push({
      id: business.id,
      name: business.name,
      slug: business.slug,
      logo_url: business.logo_url,
      website_url: business.website_url,
      social_links: business.social_links,
      locationLabel: closest.location.label ?? ([closest.location.city, closest.location.state].filter(Boolean).join(", ") || null),
      distanceMeters: closest.distance,
      eventOffers: [],
    });
  }

  const nearest = results.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, limit);
  if (nearest.length === 0) return nearest;

  const { data: offerRows } = await supabase
    .schema("public")
    .from("partner_offers")
    .select("id, business_id, title, description, event_redemption_limit")
    .in(
      "business_id",
      nearest.map((p) => p.id)
    )
    .eq("event_eligible", true)
    .eq("status", "active");

  for (const offer of (offerRows ?? []) as { id: string; business_id: string; title: string; description: string | null; event_redemption_limit: number | null }[]) {
    const partner = nearest.find((p) => p.id === offer.business_id);
    if (partner) partner.eventOffers.push({ id: offer.id, title: offer.title, description: offer.description, event_redemption_limit: offer.event_redemption_limit });
  }

  return nearest;
}

// Shared by any UI that needs to know up front whether nearby partners exist
// for a chosen location (e.g. to decide whether to show a "Nearby Partners"
// section/step at all), rather than each caller re-implementing the fetch.
//
// routeCoordinates is the drawn route's vertices as [lng, lat] pairs (GeoJSON order,
// matches RouteLineString) -- when present, every vertex is checked so a route-based
// cleanup isn't limited to just its start pin. lat/lng is still required as the
// single-point fallback/primary pin.
export function useNearbyPartners(
  lat: number | null,
  lng: number | null,
  radiusMeters = 805,
  limit = 5,
  routeCoordinates?: [number, number][] | null
): { partners: NearbyPartner[]; loading: boolean } {
  const [partners, setPartners] = useState<NearbyPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const routeKey = routeCoordinates ? JSON.stringify(routeCoordinates) : "";

  useEffect(() => {
    if (lat === null || lng === null) {
      setPartners([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const eventPoints = [{ lat, lng }, ...(routeCoordinates ?? []).map(([lng, lat]) => ({ lat, lng }))];
    getNearbyPartners(eventPoints, radiusMeters, limit).then((results) => {
      if (!cancelled) {
        setPartners(results);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, radiusMeters, limit, routeKey]);

  return { partners, loading };
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  if (miles < 0.1) return "< 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}
