"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ShareButton from "@/components/ShareButton";
import { OfferCard, type BrowseBusiness, type BrowseOffer } from "../PartnersBrowseClient";

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), { ssr: false });

export type DetailLocation = {
  id: string;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number;
  lng: number;
  google_maps_url: string | null;
};

export type DetailBusiness = Omit<BrowseBusiness, "locations"> & { locations: DetailLocation[] };

function formatAddress(location: DetailLocation): string | null {
  const line1 = [location.address_line1, location.address_line2].filter(Boolean).join(", ");
  const cityState = [location.city, location.state].filter(Boolean).join(", ");
  const line2 = [cityState, location.postal_code].filter(Boolean).join(" ");
  const parts = [line1, line2, location.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function PartnerDetailClient({
  business,
  offers,
  userId,
  userPoints,
}: {
  business: DetailBusiness;
  offers: BrowseOffer[];
  userId: string | null;
  userPoints: number | null;
}) {
  const [points, setPoints] = useState(userPoints);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const locations = business.locations;

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { maximumAge: 5 * 60 * 1000, timeout: 8000 }
    );
  }, []);
  const socialLinks = business.social_links ?? {};
  const socialEntries = Object.entries(socialLinks).filter(([platform, url]) => !!url && platform !== "website");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {business.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.name} className="w-16 h-16 rounded-xl object-cover shrink-0 shadow-elevation-1" />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-zinc-100">{business.name}</h1>
            {locations.length === 1 && formatAddress(locations[0]) && (
              <p className="text-sm text-zinc-500 mt-1">{formatAddress(locations[0])}</p>
            )}
          </div>
        </div>
        <ShareButton
          variant="icon"
          content={{ title: business.name, text: business.description ?? undefined }}
        />
      </div>

      {business.description && (
        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{business.description}</p>
      )}

      {userId && (
        <div className="text-sm text-zinc-400">
          Your balance: <span className="font-semibold text-zinc-100">{points ?? 0} pts</span>
        </div>
      )}

      <div className="space-y-3">
        {offers.length === 0 ? (
          <p className="text-sm text-zinc-500">No active offers from {business.name} right now — check back soon.</p>
        ) : (
          offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              businessName={business.name}
              businessSlug={business.slug}
              locations={locations}
              userId={userId}
              userPoints={points}
              userLocation={userLocation}
              onRedeemed={(_offerId, spent) => setPoints((p) => (p !== null ? p - spent : p))}
            />
          ))
        )}
      </div>

      {locations.map((location) => {
        const address = formatAddress(location);
        return (
          <div key={location.id} className="space-y-3">
            {locations.length > 1 && (
              <h3 className="text-sm font-semibold text-zinc-200">{location.label ?? "Location"}</h3>
            )}
            <MiniMapPreview lat={location.lat} lng={location.lng} interactive heightClassName="h-[260px]" />
            <div className="flex flex-wrap items-center gap-4">
              <a
                href={
                  location.google_maps_url ??
                  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address ?? `${location.lat},${location.lng}`)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-sky-400 transition-colors duration-150 hover:text-sky-300 active:text-sky-300"
              >
                <span aria-hidden="true">🧭</span>
                Get directions
              </a>
              {locations.length > 1 && address && <span className="text-sm text-zinc-500">{address}</span>}
              {(business.campaigns ?? []).map((c) => (
                <Link
                  key={c.slug}
                  href={`/campaigns/${c.slug}?lat=${location.lat}&lng=${location.lng}`}
                  className="inline-flex items-center gap-1.5 text-sm text-sky-400 transition-colors duration-150 hover:text-sky-300 active:text-sky-300"
                >
                  <span aria-hidden="true">📍</span>
                  {(business.campaigns?.length ?? 0) > 1 ? `Show on map (${c.title})` : "Show on map"}
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-4 text-sm">
        {business.website_url && (
          <a
            href={business.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 transition-colors duration-150 hover:text-emerald-300 active:text-emerald-300"
          >
            Website
          </a>
        )}
        {socialEntries.map(([platform, url]) => (
          <a
            key={platform}
            href={url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 transition-colors duration-150 hover:text-emerald-300 active:text-emerald-300 capitalize"
          >
            {platform}
          </a>
        ))}
      </div>

    </div>
  );
}
