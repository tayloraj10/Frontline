"use client";

import Link from "next/link";
import { formatDistance, type NearbyPartner } from "@/lib/nearbyPartners";

const SOCIAL_LABELS: { key: string; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "twitter", label: "Twitter / X" },
];

function PartnerCard({
  partner,
  selectedOfferIds,
  onToggleOffer,
}: {
  partner: NearbyPartner;
  selectedOfferIds?: string[];
  onToggleOffer?: (offerId: string) => void;
}) {
  const socialEntries = Object.entries(partner.social_links ?? {}).filter(
    ([platform, url]) => !!url && SOCIAL_LABELS.some((s) => s.key === platform)
  );
  const hasEventOffers = partner.eventOffers.length > 0;
  return (
    <div
      className={`rounded-md px-3 py-2 border ${hasEventOffers ? "bg-amber-950/10 border-amber-800/50" : "bg-zinc-900 border-zinc-800"
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link href={`/partners/${partner.slug}`} className="text-sm font-medium text-zinc-100 hover:underline">
              {partner.name}
            </Link>
            {hasEventOffers && (
              <span
                title="Event offers are free for anyone who checks in to this cleanup once you attach them below, no points required."
                className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-800/60 text-amber-400 text-[10px] font-semibold shrink-0 cursor-help"
              >
                Event offer{partner.eventOffers.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            {formatDistance(partner.distanceMeters)}
            {partner.locationLabel ? ` · ${partner.locationLabel}` : ""}
          </p>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            {partner.website_url && (
              <a href={partner.website_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-400 hover:underline">
                Website
              </a>
            )}
            {socialEntries.map(([platform, url]) => (
              <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-sky-400 hover:underline">
                {SOCIAL_LABELS.find((s) => s.key === platform)?.label ?? platform}
              </a>
            ))}
          </div>
        </div>
      </div>
      {onToggleOffer && hasEventOffers && (
        <div className="mt-2 space-y-1.5 border-t border-amber-900/40 pt-2">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
            Free for attendees who check in, attach to this event?
          </p>
          {partner.eventOffers.map((offer) => {
            const checked = selectedOfferIds?.includes(offer.id) ?? false;
            return (
              <div key={offer.id} className="space-y-1">
                <label
                  htmlFor={`event-offer-${offer.id}`}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer border transition-colors duration-150 ${checked ? "border-amber-500 bg-amber-950/30" : "border-dashed border-zinc-700 hover:border-amber-700/60"
                    }`}
                >
                  <input
                    id={`event-offer-${offer.id}`}
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleOffer(offer.id)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-500 shrink-0"
                  />
                  <span className={`text-xs ${checked ? "text-amber-200" : "text-zinc-300"}`}>
                    {offer.title}
                    {offer.description && <span className="block text-[11px] text-zinc-600">{offer.description}</span>}
                  </span>
                </label>
                {checked && (
                  <p className="pl-6 text-[11px] text-zinc-500">
                    {offer.event_redemption_limit != null
                      ? `Business set a cap of ${offer.event_redemption_limit} redemptions for this offer at any one event.`
                      : "No redemption cap set by the business, they'll honor everyone who checks in."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pure display component -- callers fetch via useNearbyPartners (frontend/src/lib/nearbyPartners.ts)
// so they can also decide whether to show this section/step at all before rendering it.
// selectedOfferIds/onToggleOffer are optional so callers that don't support attaching event
// offers to the cleanup (none currently) can skip that behavior entirely.
export default function NearbyPartnersPanel({
  partners,
  selectedOfferIds,
  onToggleOffer,
  maxAttendees,
  onSetMaxAttendees,
}: {
  partners: NearbyPartner[];
  selectedOfferIds?: string[];
  onToggleOffer?: (offerId: string) => void;
  maxAttendees?: string;
  onSetMaxAttendees?: (value: string) => void;
}) {
  if (partners.length === 0) return null;

  const eventPartners = partners.filter((p) => p.eventOffers.length > 0);
  const otherPartners = partners.filter((p) => p.eventOffers.length === 0);

  const selectedLimits = (selectedOfferIds ?? [])
    .map((id) => partners.flatMap((p) => p.eventOffers).find((o) => o.id === id)?.event_redemption_limit)
    .filter((n): n is number => n != null);
  const recommendedLimit = selectedLimits.length > 0 ? Math.min(...selectedLimits) : null;
  const showRsvpRecommendation =
    recommendedLimit != null && onSetMaxAttendees && (!maxAttendees || !maxAttendees.trim());

  return (
    <div className="space-y-3">
      {showRsvpRecommendation && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-800/50 bg-sky-950/10 p-3">
          <p className="text-[11px] text-zinc-400">
            {`One of the offers you selected is capped at ${recommendedLimit} redemptions per event. You could set your RSVP limit to match, though it's entirely optional, most organizers leave RSVPs unlimited and businesses honor whoever shows up.`}
          </p>
          <button
            type="button"
            onClick={() => onSetMaxAttendees?.(String(recommendedLimit))}
            className="shrink-0 px-2.5 py-1 text-[11px] font-medium rounded bg-sky-900/60 border border-sky-700/60 text-sky-300 hover:bg-sky-900"
          >
            Set RSVP limit to {recommendedLimit}
          </button>
        </div>
      )}
      {eventPartners.length > 0 && (
        <div className="space-y-2 rounded-lg border border-amber-800/50 bg-amber-950/5 p-3">
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
              Free event offers available nearby
            </p>
            <p className="text-[11px] text-zinc-600">
              Attach an offer below so checked-in attendees can redeem it for free, no points required, within 4 hours after the event ends.
            </p>
          </div>
          <div className="space-y-2">
            {eventPartners.map((partner) => (
              <PartnerCard
                key={partner.id}
                partner={partner}
                selectedOfferIds={selectedOfferIds}
                onToggleOffer={onToggleOffer}
              />
            ))}
          </div>
        </div>
      )}

      {otherPartners.length > 0 && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-zinc-300">Partners near this cleanup</p>
            <p className="text-[11px] text-zinc-600">
              Consider reaching out, attendees showing up for a free bite or drink afterward is a great way to keep people coming back.
            </p>
          </div>
          <div className="space-y-2">
            {otherPartners.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
