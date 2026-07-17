"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RedemptionConfirmationModal, { type RedemptionProof } from "./RedemptionConfirmationModal";

export type BrowseBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  city: string | null;
  state: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  social_links: Record<string, string> | null;
};

export type BrowseOffer = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  starts_at: string;
  ends_at: string | null;
};

type Redemption = { id: string; code: string; points_spent: number; redeemed_at: string | null; used_at: string | null };

export function OfferCard({
  offer,
  businessName,
  userId,
  userPoints,
  onRedeemed,
}: {
  offer: BrowseOffer;
  businessName: string;
  userId: string | null;
  userPoints: number | null;
  onRedeemed: (offerId: string, spent: number) => void;
}) {
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<RedemptionProof | null>(null);
  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL;

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
  const eligible = userPoints !== null && userPoints >= requirement;
  const redeemedCount = redemptions?.length ?? 0;
  const maxedOut = offer.max_redemptions_per_user != null && redeemedCount >= offer.max_redemptions_per_user;

  const handleMarkedUsed = (redemptionId: string, usedAt: string) => {
    setRedemptions((prev) => (prev ?? []).map((r) => (r.id === redemptionId ? { ...r, used_at: usedAt } : r)));
    setProof((prev) => (prev && prev.redemptionId === redemptionId ? { ...prev, usedAt } : prev));
  };

  const handleRedeem = async () => {
    if (!userId) return;
    setRedeeming(true);
    setError(null);
    try {
      const res = await fetch(`${fastapiUrl}/api/partners/offers/${offer.id}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
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
    <div className="border border-zinc-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{offer.title}</h3>
          {offer.description && <p className="text-sm text-zinc-500 mt-0.5">{offer.description}</p>}
        </div>
        <span className="text-xs font-semibold text-emerald-400 shrink-0">
          {offer.redemption_mode === "spend" ? `${offer.points_cost} pts` : `${offer.points_threshold}+ pts`}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {!userId ? (
          <Link href="/login" className="text-xs text-emerald-400 hover:text-emerald-300">
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
            className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            Redeemed{redemptions[0]?.code ? ` — code ${redemptions[0].code}` : ""}
          </button>
        ) : (
          <button
            onClick={handleRedeem}
            disabled={!eligible || redeeming}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
          >
            {redeeming ? "Redeeming…" : eligible ? "Redeem" : "Not enough points"}
          </button>
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
            className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
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

  if (businesses.length === 0) {
    return <p className="text-sm text-zinc-500">No active partner offers right now — check back soon.</p>;
  }

  return (
    <div className="space-y-6">
      {userId && (
        <div className="text-sm text-zinc-400">
          Your balance: <span className="font-semibold text-zinc-100">{points ?? 0} pts</span>
        </div>
      )}

      {businesses.map((business) => (
        <div key={business.id} id={`business-${business.slug}`} className="border border-zinc-800 rounded-xl overflow-hidden">
          <div className="w-full px-4 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center gap-3">
            {business.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={business.logo_url} alt={business.name} className="w-8 h-8 rounded object-cover shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-zinc-100 truncate">{business.name}</h2>
              {(business.city || business.state) && (
                <p className="text-xs text-zinc-500 truncate">
                  {[business.city, business.state].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            <Link
              href={`/partners/${business.slug}`}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-950 shrink-0 px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 active:bg-emerald-500 shadow-sm transition-colors"
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
                userId={userId}
                userPoints={points}
                onRedeemed={(_offerId, spent) => setPoints((p) => (p !== null ? p - spent : p))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
