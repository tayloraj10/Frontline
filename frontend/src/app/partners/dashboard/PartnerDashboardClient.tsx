"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import BusinessForm, { type BusinessSocialLinks, type BusinessFormPayload } from "@/components/partners/BusinessForm";
import OfferForm, { type OfferFormPayload } from "@/components/partners/OfferForm";
import { OfferRow } from "@/app/admin/AdminPanel";

export type DashboardBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
  social_links: BusinessSocialLinks | null;
  status: string;
  created_at: string;
};

export type DashboardOffer = {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  redemption_mode: "spend" | "threshold";
  points_cost: number | null;
  points_threshold: number | null;
  max_redemptions_per_user: number | null;
  max_total_redemptions: number | null;
  code: string | null;
  status: string;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

function BusinessPanel({
  business,
  offers,
  setOffers,
  businesses,
  setBusinesses,
  redemptionCounts,
}: {
  business: DashboardBusiness;
  offers: DashboardOffer[];
  setOffers: (o: DashboardOffer[]) => void;
  businesses: DashboardBusiness[];
  setBusinesses: (b: DashboardBusiness[]) => void;
  redemptionCounts: Record<string, number>;
}) {
  const [editing, setEditing] = useState(false);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const businessOffers = offers.filter((o) => o.business_id === business.id);

  const handleEditBusiness = async (payload: BusinessFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { campaignIds: _campaignIds, ...rest } = payload;
    const { data, error: updateErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .update(rest)
      .eq("id", business.id)
      .select(
        "id, name, slug, description, logo_url, website_url, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, social_links, status, created_at"
      )
      .single();

    if (updateErr) return updateErr.code === "23505" ? "Slug already taken." : updateErr.message;

    const updated = data as DashboardBusiness;
    setBusinesses(businesses.map((b) => (b.id === updated.id ? updated : b)));
    setEditing(false);
    return null;
  };

  const handleCreateOffer = async (payload: OfferFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { data, error: insertErr } = await supabase
      .schema("public")
      .from("partner_offers")
      .insert({ ...payload, business_id: business.id, status: "active" })
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, code, status, starts_at, ends_at, created_at")
      .single();

    if (insertErr) return insertErr.message;

    setOffers([...offers, data as DashboardOffer]);
    setShowCreateOffer(false);
    return null;
  };

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          {business.logo_url ? (
            <img src={business.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
          ) : (
            <span className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-black text-zinc-400 shrink-0">
              {business.name[0]?.toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200">{business.name}</p>
            <p className="text-xs text-zinc-600">{businessOffers.length} offer{businessOffers.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 shrink-0"
        >
          {editing ? "Cancel edit" : "Edit business info"}
        </button>
      </div>
      <div className="border-t border-zinc-800 px-5 py-4 space-y-3 bg-zinc-950/40">
        {editing && (
          <BusinessForm
            initial={business}
            onSubmit={handleEditBusiness}
            onCancel={() => setEditing(false)}
            submitLabel="Save changes"
          />
        )}
        {businessOffers.map((o) => (
          <OfferRow
            key={o.id}
            offer={o}
            redemptionCount={redemptionCounts[o.id] ?? 0}
            onUpdated={(updated) => setOffers(offers.map((existing) => (existing.id === updated.id ? (updated as DashboardOffer) : existing)))}
            onCancelled={(id) => setOffers(offers.map((existing) => (existing.id === id ? { ...existing, status: "cancelled" } : existing)))}
          />
        ))}
        {businessOffers.length === 0 && !showCreateOffer && (
          <p className="text-xs text-zinc-600">No offers yet.</p>
        )}
        <button
          onClick={() => setShowCreateOffer(!showCreateOffer)}
          className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
        >
          {showCreateOffer ? "Cancel" : "+ New Offer"}
        </button>
        {showCreateOffer && (
          <OfferForm onSubmit={handleCreateOffer} onCancel={() => setShowCreateOffer(false)} submitLabel="Create offer" />
        )}
      </div>
    </div>
  );
}

export default function PartnerDashboardClient({
  initialBusinesses,
  initialOffers,
  redemptionCounts,
}: {
  initialBusinesses: DashboardBusiness[];
  initialOffers: DashboardOffer[];
  redemptionCounts: Record<string, number>;
}) {
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [offers, setOffers] = useState(initialOffers);

  if (businesses.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        You don't currently manage any partner businesses. If you run a business on this platform,
        ask a site admin to grant you access.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {businesses.map((b) => (
        <BusinessPanel
          key={b.id}
          business={b}
          offers={offers}
          setOffers={setOffers}
          businesses={businesses}
          setBusinesses={setBusinesses}
          redemptionCounts={redemptionCounts}
        />
      ))}
    </div>
  );
}
