"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { reconcileBusinessLocations } from "@/lib/partnerLocations";
import BusinessForm, { type BusinessSocialLinks, type BusinessFormPayload } from "@/components/partners/BusinessForm";
import OfferForm, { type OfferFormPayload, type OfferFormLocation } from "@/components/partners/OfferForm";
import { OfferRow } from "@/app/admin/AdminPanel";
import BusinessRadiusView, { MIN_TIER_ACTIVITY } from "@/components/partners/BusinessRadiusView";
import RedemptionHistoryTable from "@/components/partners/RedemptionHistoryTable";

export type DashboardBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  social_links: BusinessSocialLinks | null;
  status: string;
  created_at: string;
};

export type DashboardLocation = {
  id: string;
  business_id: string;
  label: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
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
  location_id: string | null;
};

function BusinessPanel({
  business,
  offers,
  setOffers,
  businesses,
  setBusinesses,
  locations,
  setLocations,
  redemptionCounts,
  allCampaigns,
  campaignIds,
  setCampaignIdsByBusiness,
  isSiteAdmin,
  fastapiUrl,
  viewerUserId,
}: {
  business: DashboardBusiness;
  offers: DashboardOffer[];
  setOffers: (o: DashboardOffer[]) => void;
  businesses: DashboardBusiness[];
  setBusinesses: (b: DashboardBusiness[]) => void;
  locations: DashboardLocation[];
  setLocations: (l: DashboardLocation[]) => void;
  redemptionCounts: Record<string, number>;
  allCampaigns: { id: string; title: string; slug: string }[];
  campaignIds: string[];
  setCampaignIdsByBusiness: (updater: (prev: Record<string, string[]>) => Record<string, string[]>) => void;
  isSiteAdmin: boolean;
  fastapiUrl: string;
  viewerUserId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [showCreateOffer, setShowCreateOffer] = useState(false);
  const [activeTab, setActiveTab] = useState<"offers" | "redemptions" | "radius">("offers");
  const businessOffers = offers.filter((o) => o.business_id === business.id);
  const businessLocations = locations.filter((l) => l.business_id === business.id);
  const businessLocationIds = businessLocations.map((l) => l.id).join(",");

  // Gate the "Radius of influence" tab itself on whether ANY location has something nearby to
  // show — checking only the first location would hide the tab for a multi-location business
  // whose first-listed spot just happens to be quiet. Fetched independently of BusinessRadiusView
  // so the tab can be hidden before it's ever opened.
  const [radiusTabVisible, setRadiusTabVisible] = useState(true);
  useEffect(() => {
    if (businessLocations.length === 0) {
      setRadiusTabVisible(false);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ viewer_user_id: viewerUserId });
    Promise.all(
      businessLocations.map((loc) =>
        fetch(`${fastapiUrl}/api/partners/businesses/${business.id}/locations/${loc.id}/tier-activity?${params}`)
          .then((res) => res.json())
          .catch(() => ({}) as Record<string, number>)
      )
    ).then((results: Record<"block" | "neighborhood" | "wide", number>[]) => {
      if (cancelled) return;
      setRadiusTabVisible(results.some((json) => Object.values(json).some((n) => n >= MIN_TIER_ACTIVITY)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id, businessLocationIds, fastapiUrl, viewerUserId]);

  useEffect(() => {
    if (activeTab === "radius" && !radiusTabVisible) setActiveTab("offers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusTabVisible]);
  const linkedCampaigns = campaignIds
    .map((id) => allCampaigns.find((c) => c.id === id))
    .filter((c): c is { id: string; title: string; slug: string } => !!c);

  const handleEditBusiness = async (payload: BusinessFormPayload): Promise<string | null> => {
    const supabase = createClient();
    const { campaignIds: submittedCampaignIds, locations: submittedLocations, ...rest } = payload;
    // Non-admins never see the Campaigns selector (only Trash War is live on the map
    // right now), so always pin their businesses to it regardless of prior linkage.
    const trashWarCampaignId = allCampaigns.find((c) => c.slug === "trash-war")?.id;
    const nextCampaignIds = isSiteAdmin
      ? submittedCampaignIds
      : trashWarCampaignId
        ? [trashWarCampaignId]
        : [];
    const { data, error: updateErr } = await supabase
      .schema("public")
      .from("partner_businesses")
      .update(rest)
      .eq("id", business.id)
      .select(
        "id, name, slug, description, logo_url, website_url, social_links, status, created_at"
      )
      .single();

    if (updateErr) return updateErr.code === "23505" ? "Slug already taken." : updateErr.message;

    const locationsResult = await reconcileBusinessLocations<DashboardLocation>(
      supabase,
      business.id,
      businessLocations,
      submittedLocations,
      "id, business_id, label, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, status, created_at"
    );
    if (locationsResult.rows === null) return locationsResult.error;

    setLocations([
      ...locations.filter((l) => l.business_id !== business.id),
      ...locationsResult.rows,
    ]);

    const currentLinked = new Set(campaignIds);
    const nextLinked = new Set(nextCampaignIds);
    const toAdd = nextCampaignIds.filter((id) => !currentLinked.has(id));
    const toRemove = campaignIds.filter((id) => !nextLinked.has(id));

    if (toAdd.length > 0) {
      const { error: linkErr } = await supabase
        .schema("public")
        .from("campaign_partner_businesses")
        .insert(toAdd.map((campaign_id) => ({ business_id: business.id, campaign_id })));
      if (linkErr) return `Business updated, but failed to link some campaigns: ${linkErr.message}`;
    }
    if (toRemove.length > 0) {
      const { error: unlinkErr } = await supabase
        .schema("public")
        .from("campaign_partner_businesses")
        .delete()
        .eq("business_id", business.id)
        .in("campaign_id", toRemove);
      if (unlinkErr) return `Business updated, but failed to unlink some campaigns: ${unlinkErr.message}`;
    }

    setCampaignIdsByBusiness((prev) => ({ ...prev, [business.id]: nextCampaignIds }));

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
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, code, status, starts_at, ends_at, created_at, location_id")
      .single();

    if (insertErr) return insertErr.message;

    setOffers([...offers, data as DashboardOffer]);
    setShowCreateOffer(false);
    return null;
  };

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden shadow-elevation-2 bg-zinc-950">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          {business.logo_url ? (
            <img src={business.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 shadow-elevation-1" />
          ) : (
            <span className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-black text-zinc-400 shrink-0">
              {business.name[0]?.toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-200 truncate">{business.name}</p>
            <p className="text-xs text-zinc-600">
              {businessOffers.length} offer{businessOffers.length !== 1 ? "s" : ""} · {businessLocations.length} location{businessLocations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-x-1 gap-y-1 shrink-0">
          {businessLocations.length > 0 && linkedCampaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.slug}?lat=${businessLocations[0].lat}&lng=${businessLocations[0].lng}`}
              className="text-xs text-sky-400 hover:text-sky-300 active:text-sky-300 transition-colors duration-150 px-2 py-1"
            >
              {linkedCampaigns.length > 1 ? `View on map (${c.title})` : "View on map"}
            </Link>
          ))}
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-[color,transform] duration-150 active:scale-[0.95] touch-manipulation px-2 py-1"
          >
            {editing ? "Cancel edit" : "Edit business info"}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-zinc-800 px-5 py-2.5 bg-zinc-950/60">
        {(
          [
            { key: "offers", label: "Offers", count: businessOffers.length },
            { key: "redemptions", label: "Redemptions", count: null },
            ...(radiusTabVisible ? [{ key: "radius", label: "Radius of influence", count: null }] : []),
          ] as { key: "offers" | "redemptions" | "radius"; label: string; count: number | null }[]
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-150 ${
              activeTab === tab.key
                ? "bg-emerald-700 text-white shadow-elevation-1"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span
                className={`text-[10px] rounded-full px-1.5 leading-4 ${
                  activeTab === tab.key ? "bg-emerald-900/60 text-emerald-100" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="px-5 py-4 space-y-3 bg-zinc-950/40">
        {activeTab === "offers" && (
          <>
            {editing && (
              <BusinessForm
                initial={{
                  ...business,
                  locations: businessLocations.map((l) => ({
                    id: l.id,
                    label: l.label,
                    address_line1: l.address_line1,
                    address_line2: l.address_line2,
                    city: l.city,
                    state: l.state,
                    postal_code: l.postal_code,
                    country: l.country,
                    lat: l.lat,
                    lng: l.lng,
                    google_maps_url: l.google_maps_url,
                  })),
                }}
                initialCampaignIds={campaignIds}
                campaigns={isSiteAdmin ? allCampaigns : undefined}
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
                locations={businessLocations}
                onUpdated={(updated) => setOffers(offers.map((existing) => (existing.id === updated.id ? (updated as DashboardOffer) : existing)))}
                onCancelled={(id) => setOffers(offers.map((existing) => (existing.id === id ? { ...existing, status: "cancelled" } : existing)))}
              />
            ))}
            {businessOffers.length === 0 && !showCreateOffer && (
              <p className="text-xs text-zinc-600">No offers yet.</p>
            )}
            <button
              onClick={() => setShowCreateOffer(!showCreateOffer)}
              className="px-3 py-1.5 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-medium shadow-elevation-1 transition-[background-color,transform] duration-150 active:scale-[0.95] touch-manipulation"
            >
              {showCreateOffer ? "Cancel" : "+ New Offer"}
            </button>
            {showCreateOffer && (
              <OfferForm locations={businessLocations} onSubmit={handleCreateOffer} onCancel={() => setShowCreateOffer(false)} submitLabel="Create offer" />
            )}
          </>
        )}
        {activeTab === "redemptions" && (
          <RedemptionHistoryTable
            businessId={business.id}
            offers={businessOffers}
            fastapiUrl={fastapiUrl}
            viewerUserId={viewerUserId}
          />
        )}
        {activeTab === "radius" && (
          <BusinessRadiusView
            businessId={business.id}
            locations={businessLocations}
            fastapiUrl={fastapiUrl}
            viewerUserId={viewerUserId}
          />
        )}
      </div>
    </div>
  );
}

export default function PartnerDashboardClient({
  initialBusinesses,
  initialOffers,
  initialLocations,
  redemptionCounts,
  allCampaigns,
  initialCampaignIdsByBusiness,
  isSiteAdmin,
  fastapiUrl,
  viewerUserId,
}: {
  initialBusinesses: DashboardBusiness[];
  initialOffers: DashboardOffer[];
  initialLocations: DashboardLocation[];
  redemptionCounts: Record<string, number>;
  allCampaigns: { id: string; title: string; slug: string }[];
  initialCampaignIdsByBusiness: Record<string, string[]>;
  isSiteAdmin: boolean;
  fastapiUrl: string;
  viewerUserId: string;
}) {
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [offers, setOffers] = useState(initialOffers);
  const [locations, setLocations] = useState(initialLocations);
  const [campaignIdsByBusiness, setCampaignIdsByBusiness] = useState(initialCampaignIdsByBusiness);

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
          locations={locations}
          setLocations={setLocations}
          redemptionCounts={redemptionCounts}
          allCampaigns={allCampaigns}
          campaignIds={campaignIdsByBusiness[b.id] ?? []}
          setCampaignIdsByBusiness={setCampaignIdsByBusiness}
          isSiteAdmin={isSiteAdmin}
          fastapiUrl={fastapiUrl}
          viewerUserId={viewerUserId}
        />
      ))}
    </div>
  );
}
