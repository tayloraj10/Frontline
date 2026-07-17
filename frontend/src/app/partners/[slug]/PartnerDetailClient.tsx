"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { OfferCard, type BrowseBusiness, type BrowseOffer } from "../PartnersBrowseClient";

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), { ssr: false });

function formatAddress(business: BrowseBusiness): string | null {
  const line1 = [business.address_line1, business.address_line2].filter(Boolean).join(", ");
  const cityState = [business.city, business.state].filter(Boolean).join(", ");
  const line2 = [cityState, business.postal_code].filter(Boolean).join(" ");
  const parts = [line1, line2, business.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export default function PartnerDetailClient({
  business,
  offers,
  userId,
  userPoints,
}: {
  business: BrowseBusiness;
  offers: BrowseOffer[];
  userId: string | null;
  userPoints: number | null;
}) {
  const [points, setPoints] = useState(userPoints);
  const address = formatAddress(business);
  const hasLocation = business.lat != null && business.lng != null;
  const socialLinks = business.social_links ?? {};
  const socialEntries = Object.entries(socialLinks).filter(([platform, url]) => !!url && platform !== "website");

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        {business.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logo_url} alt={business.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-zinc-100">{business.name}</h1>
          {address && <p className="text-sm text-zinc-500 mt-1">{address}</p>}
        </div>
      </div>

      {business.description && (
        <p className="text-sm text-zinc-300 whitespace-pre-wrap">{business.description}</p>
      )}

      {hasLocation && (
        <MiniMapPreview
          lat={business.lat as number}
          lng={business.lng as number}
          interactive
          heightClassName="h-[260px]"
        />
      )}

      <div className="flex flex-wrap gap-4 text-sm">
        {business.website_url && (
          <a
            href={business.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Website
          </a>
        )}
        {business.google_maps_url && (
          <a
            href={business.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Get directions
          </a>
        )}
        {socialEntries.map(([platform, url]) => (
          <a
            key={platform}
            href={url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 capitalize"
          >
            {platform}
          </a>
        ))}
      </div>

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
              userId={userId}
              userPoints={points}
              onRedeemed={(_offerId, spent) => setPoints((p) => (p !== null ? p - spent : p))}
            />
          ))
        )}
      </div>
    </div>
  );
}
