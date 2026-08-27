"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";
import RedemptionConfirmationModal, { type RedemptionProof } from "./RedemptionConfirmationModal";
import { haversineMeters } from "@/lib/nearbyPartners";
import PartnersMap from "@/components/partners/PartnersMap";

export type BrowseLocation = {
  id: string;
  label: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
};

const FAR_LOCATION_WARNING_METERS = 3218; // ~2 miles further than the nearest location

function formatLocationOption(l: BrowseLocation): string {
  const address = [l.address_line1, l.city, l.state].filter(Boolean).join(", ");
  if (l.label && address) return `${l.label} · ${address}`;
  return l.label ?? address ?? "Location";
}

export type BrowseBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  locations: BrowseLocation[];
  social_links: Record<string, string> | null;
  campaigns?: { slug: string; title: string }[];
};

export type BrowseOffer = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold" | "event_only";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  starts_at: string;
  ends_at: string | null;
  location_id: string | null;
  event_eligible: boolean;
};

type Redemption = { id: string; code: string; points_spent: number; redeemed_at: string | null; used_at: string | null };

export function OfferCard({
  offer,
  businessName,
  businessSlug,
  locations,
  userId,
  userPoints,
  userLocation,
  onRedeemed,
}: {
  offer: BrowseOffer;
  businessName: string;
  businessSlug: string;
  locations: BrowseLocation[];
  userId: string | null;
  userPoints: number | null;
  userLocation: { lat: number; lng: number } | null;
  onRedeemed: (offerId: string, spent: number) => void;
}) {
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<RedemptionProof | null>(null);
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;

  // Location resolution: offer.location_id pins it to one location; otherwise, if the
  // business has more than one, the redeemer must pick which one they're at.
  const needsLocationPicker = offer.location_id === null && locations.length > 1;
  const [pickedLocationId, setPickedLocationId] = useState<string>("");
  const [autoPicked, setAutoPicked] = useState(false);

  const nearestLocation = userLocation
    ? locations.reduce<{ location: BrowseLocation; distance: number } | null>((closest, l) => {
        const distance = haversineMeters(userLocation.lat, userLocation.lng, l.lat, l.lng);
        return !closest || distance < closest.distance ? { location: l, distance } : closest;
      }, null)
    : null;

  useEffect(() => {
    if (needsLocationPicker && !pickedLocationId && nearestLocation) {
      setPickedLocationId(nearestLocation.location.id);
      setAutoPicked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsLocationPicker, nearestLocation?.location.id]);

  const pickedLocation = locations.find((l) => l.id === pickedLocationId) ?? null;
  const farFromPicked =
    !autoPicked && userLocation && pickedLocation && nearestLocation && pickedLocation.id !== nearestLocation.location.id
      ? haversineMeters(userLocation.lat, userLocation.lng, pickedLocation.lat, pickedLocation.lng) - nearestLocation.distance >
        FAR_LOCATION_WARNING_METERS
      : false;

  useEffect(() => {
    if (!userId) {
      setRedemptions([]);
      return;
    }
    let cancelled = false;
    fetch(`${fastapiUrl}/api/partners/offers/${offer.id}/redemptions/me?user_id=${userId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setRedemptions(data);
      })
      .catch(() => {
        if (!cancelled) setRedemptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, offer.id, fastapiUrl]);

  const requirement = offer.redemption_mode === "spend" ? offer.points_cost ?? 0 : offer.points_threshold ?? 0;
  const eligible = offer.redemption_mode !== "event_only" && userPoints !== null && userPoints >= requirement;
  const redeemedCount = redemptions?.length ?? 0;
  const maxedOut = offer.max_redemptions_per_user != null && redeemedCount >= offer.max_redemptions_per_user;

  const handleMarkedUsed = (redemptionId: string, usedAt: string) => {
    setRedemptions((prev) => (prev ?? []).map((r) => (r.id === redemptionId ? { ...r, used_at: usedAt } : r)));
    setProof((prev) => (prev && prev.redemptionId === redemptionId ? { ...prev, usedAt } : prev));
  };

  const handleRedeem = async () => {
    if (!userId) return;
    if (needsLocationPicker && !pickedLocationId) {
      setError("Choose a location first");
      return;
    }
    setRedeeming(true);
    setError(null);
    try {
      const locationId = offer.location_id ?? (needsLocationPicker ? pickedLocationId : locations[0]?.id ?? null);
      const res = await fetch(`${fastapiUrl}/api/partners/offers/${offer.id}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, location_id: locationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "Failed to redeem offer");
      const redeemedAt = new Date().toISOString();
      setRedemptions((prev) => [
        { id: data.id, code: data.code, points_spent: data.points_spent, redeemed_at: redeemedAt, used_at: null },
        ...(prev ?? []),
      ]);
      setProof({
        redemptionId: data.id,
        businessName,
        offerTitle: offer.title,
        code: data.code ?? null,
        pointsSpent: data.points_spent ?? 0,
        redeemedAt,
        usedAt: null,
      });
      onRedeemed(offer.id, data.points_spent ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to redeem offer");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div
      id={offer.id}
      className={`border rounded-lg p-4 shadow-elevation-1 scroll-mt-20 ${
        offer.event_eligible ? "border-amber-800/60 bg-amber-950/10" : "border-zinc-800"
      }`}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-zinc-100">{offer.title}</h3>
            {offer.event_eligible && (
              <span
                title="Event offers are free to redeem for anyone who checks in to a cleanup event this offer is attached to -- no points required, redeemable within 4 hours after the event ends."
                className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-800/60 text-amber-400 text-[10px] font-semibold shrink-0 cursor-help"
              >
                Event offer
              </span>
            )}
          </div>
          {offer.description && <p className="text-sm text-zinc-500 mt-0.5">{offer.description}</p>}
          {offer.event_eligible && (
            <p className="text-[11px] text-amber-600/80 mt-0.5">
              Free for anyone who checks in to a cleanup event this offer is attached to, no points needed.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {offer.redemption_mode !== "event_only" && (
            <span className="text-xs font-semibold text-emerald-400">
              {offer.redemption_mode === "spend" ? `${offer.points_cost} pts` : `${offer.points_threshold}+ pts`}
            </span>
          )}
          <ShareButton
            variant="icon"
            size="sm"
            content={{ title: `${offer.title} at ${businessName}`, text: offer.description ?? undefined, url: `/partners/${businessSlug}#${offer.id}` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {!userId ? (
          <Link href="/login" className="text-xs text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
            Log in to redeem
          </Link>
        ) : redemptions === null ? (
          <span className="text-xs text-zinc-600">Loading…</span>
        ) : maxedOut ? (
          <button
            onClick={() =>
              setProof({
                redemptionId: redemptions[0].id,
                businessName,
                offerTitle: offer.title,
                code: redemptions[0]?.code ?? null,
                pointsSpent: redemptions[0]?.points_spent ?? 0,
                redeemedAt: redemptions[0]?.redeemed_at ?? null,
                usedAt: redemptions[0]?.used_at ?? null,
              })
            }
            className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 underline underline-offset-2 transition-colors duration-150"
          >
            Redeemed{redemptions[0]?.code ? ` - code ${redemptions[0].code}` : ""}
          </button>
        ) : offer.redemption_mode === "event_only" ? (
          <span className="text-xs text-amber-600/80">Redeemable only by checking in to a cleanup event this offer is attached to</span>
        ) : (
          <>
            {needsLocationPicker && eligible && (
              <div className="flex flex-col gap-1 w-full min-w-0">
                <select
                  value={pickedLocationId}
                  onChange={(e) => {
                    setPickedLocationId(e.target.value);
                    setAutoPicked(false);
                  }}
                  className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-zinc-500 w-full max-w-full min-w-0"
                >
                  <option value="">Choose a location…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{formatLocationOption(l)}</option>
                  ))}
                </select>
                {autoPicked && (
                  <span className="text-[11px] text-zinc-600">Picked the closest one to you, change it if that's wrong.</span>
                )}
                {farFromPicked && (
                  <span className="text-[11px] text-amber-500">This location looks far from where you are, double check you picked the right one.</span>
                )}
              </div>
            )}
            <button
              onClick={handleRedeem}
              disabled={!eligible || redeeming || (needsLocationPicker && !pickedLocationId)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white shadow-elevation-1 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 transition-[background-color,transform] duration-150 active:scale-[0.95] touch-manipulation"
            >
              {redeeming ? "Redeeming…" : eligible ? "Redeem" : "Not enough points"}
            </button>
          </>
        )}
        {redemptions && redemptions.length > 0 && !maxedOut && (
          <button
            onClick={() =>
              setProof({
                redemptionId: redemptions[0].id,
                businessName,
                offerTitle: offer.title,
                code: redemptions[0]?.code ?? null,
                pointsSpent: redemptions[0]?.points_spent ?? 0,
                redeemedAt: redemptions[0]?.redeemed_at ?? null,
                usedAt: redemptions[0]?.used_at ?? null,
              })
            }
            className="text-xs text-zinc-500 hover:text-zinc-300 active:text-zinc-300 underline underline-offset-2 transition-colors duration-150"
          >
            Last code: {redemptions[0].code}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {proof && (
        <RedemptionConfirmationModal proof={proof} onClose={() => setProof(null)} onMarkedUsed={handleMarkedUsed} />
      )}
    </div>
  );
}

export default function PartnersBrowseClient({
  businesses,
  offersByBusiness,
  userId,
  userPoints,
}: {
  businesses: BrowseBusiness[];
  offersByBusiness: Record<string, BrowseOffer[]>;
  userId: string | null;
  userPoints: number | null;
}) {
  const [points, setPoints] = useState(userPoints);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { maximumAge: 5 * 60 * 1000, timeout: 8000 }
    );
  }, []);

  const filteredBusinesses = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return businesses;
    return businesses.filter((business) => {
      const businessOffers = offersByBusiness[business.id] ?? [];
      return (
        business.name.toLowerCase().includes(q) ||
        (business.description ?? "").toLowerCase().includes(q) ||
        businessOffers.some(
          (o) => o.title.toLowerCase().includes(q) || (o.description ?? "").toLowerCase().includes(q)
        )
      );
    });
  }, [businesses, offersByBusiness, query]);

  const mapPoints = useMemo(
    () =>
      filteredBusinesses.flatMap((business) => {
        const hasEventOffer = (offersByBusiness[business.id] ?? []).some((o) => o.event_eligible);
        return business.locations.map((l) => ({
          businessId: business.id,
          businessSlug: business.slug,
          businessName: business.name,
          hasEventOffer,
          lat: l.lat,
          lng: l.lng,
        }));
      }),
    [filteredBusinesses, offersByBusiness]
  );

  if (businesses.length === 0) {
    return <p className="text-sm text-zinc-500">No active partner offers right now -- check back soon.</p>;
  }

  return (
    <div className="space-y-6">
      {userId && (
        <div className="text-sm text-zinc-400">
          Your balance: <span className="font-semibold text-zinc-100">{points ?? 0} pts</span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search businesses or offers…"
          className="flex-1 min-w-[180px] text-sm bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <div className="flex shrink-0 rounded-lg border border-zinc-700 overflow-hidden">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-2 text-xs font-semibold transition-colors duration-150 ${
              view === "list" ? "bg-emerald-700 text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("map")}
            className={`px-3 py-2 text-xs font-semibold transition-colors duration-150 ${
              view === "map" ? "bg-emerald-700 text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Map
          </button>
        </div>
      </div>

      {view === "map" && (
        mapPoints.length > 0 ? (
          <PartnersMap points={mapPoints} userLocation={userLocation} />
        ) : (
          <p className="text-sm text-zinc-500">No matching businesses have a location to show on the map.</p>
        )
      )}

      {filteredBusinesses.length === 0 && (
        <p className="text-sm text-zinc-500">No businesses or offers match "{query}".</p>
      )}

      {filteredBusinesses.map((business) => {
        const businessOffers = offersByBusiness[business.id] ?? [];
        const hasEventOffer = businessOffers.some((o) => o.event_eligible);
        return (
        <div
          key={business.id}
          id={`business-${business.slug}`}
          className={`border rounded-xl overflow-hidden shadow-elevation-2 ${
            hasEventOffer ? "border-amber-700/60 ring-1 ring-amber-800/30" : "border-zinc-800"
          }`}
        >
          <div className={`w-full px-4 py-3 border-b flex items-center gap-3 ${hasEventOffer ? "border-amber-800/40 bg-amber-950/20" : "border-zinc-800 bg-zinc-900/40"}`}>
            {business.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt={business.name} className="w-8 h-8 rounded object-cover shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-zinc-100 break-words">{business.name}</h2>
                {hasEventOffer && (
                  <span
                    title="This business has at least one offer that's free to redeem for anyone who checks in to a cleanup event it's attached to -- no points required."
                    className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-800/60 text-amber-400 text-[10px] font-semibold shrink-0 cursor-help"
                  >
                    Event offers
                  </span>
                )}
              </div>
              {business.locations.length === 1 && (business.locations[0].city || business.locations[0].state) && (
                <p className="text-xs text-zinc-500 truncate">
                  {[business.locations[0].city, business.locations[0].state].filter(Boolean).join(", ")}
                </p>
              )}
              {business.locations.length > 1 && (
                <p className="text-xs text-zinc-500 truncate">{business.locations.length} locations</p>
              )}
            </div>
            <ShareButton
              variant="icon"
              size="sm"
              content={{ title: business.name, text: business.description ?? undefined, url: `/partners/${business.slug}` }}
            />
            <Link
              href={`/partners/${business.slug}`}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-950 shrink-0 px-3 py-1.5 rounded-lg bg-emerald-400 shadow-elevation-1 hover:bg-emerald-300 active:bg-emerald-500 active:scale-[0.95] transition-[background-color,transform] duration-150 touch-manipulation"
            >
              Details
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="p-4 space-y-3">
            {(offersByBusiness[business.id] ?? []).map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                businessName={business.name}
                businessSlug={business.slug}
                locations={business.locations}
                userId={userId}
                userPoints={points}
                userLocation={userLocation}
                onRedeemed={(_offerId, spent) => setPoints((p) => (p !== null ? p - spent : p))}
              />
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}
