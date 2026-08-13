import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PartnerDashboardClient, { type DashboardBusiness, type DashboardOffer, type DashboardLocation } from "./PartnerDashboardClient";

export default async function PartnerDashboardPage() {
  const supabase = await createClient();
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isNativeApp = userAgent.includes("FrontlineNativeApp");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  const isSiteAdmin = profile?.is_admin ?? false;

  const { data: adminLinks } = await supabase
    .schema("public")
    .from("partner_business_admins")
    .select(
      "business_id, partner_businesses(id, name, slug, description, logo_url, website_url, social_links, status, created_at)"
    )
    .eq("user_id", user.id);

  const businesses: DashboardBusiness[] = ((adminLinks ?? [])
    .map((row) => row.partner_businesses as unknown as DashboardBusiness | null)
    .filter((b): b is DashboardBusiness => !!b));

  const businessIds = businesses.map((b) => b.id);

  const { data: businessLocations } = businessIds.length > 0
    ? await supabase
        .schema("public")
        .from("partner_business_locations")
        .select("id, business_id, label, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, status, created_at")
        .in("business_id", businessIds)
        .order("created_at")
    : { data: [] as DashboardLocation[] };

  const { data: campaignLinks } = businessIds.length > 0
    ? await supabase
        .schema("public")
        .from("campaign_partner_businesses")
        .select("business_id, campaign_id")
        .in("business_id", businessIds)
    : { data: [] as { business_id: string; campaign_id: string }[] };

  const campaignIdsByBusiness: Record<string, string[]> = {};
  for (const row of campaignLinks ?? []) {
    (campaignIdsByBusiness[row.business_id] ??= []).push(row.campaign_id);
  }

  const { data: allCampaignsRaw } = await supabase
    .schema("public")
    .from("campaigns")
    .select("id, title, slug")
    .order("title");
  const allCampaigns = allCampaignsRaw ?? [];

  const { data: offers } = businessIds.length > 0
    ? await supabase
        .schema("public")
        .from("partner_offers")
        .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, code, status, starts_at, ends_at, created_at, location_id")
        .in("business_id", businessIds)
        .order("created_at", { ascending: false })
    : { data: [] as DashboardOffer[] };

  const { data: redemptions } = businessIds.length > 0
    ? await supabase
        .schema("public")
        .from("partner_redemptions")
        .select("offer_id")
        .in("business_id", businessIds)
    : { data: [] as { offer_id: string }[] };

  const redemptionCounts: Record<string, number> = {};
  for (const r of redemptions ?? []) {
    redemptionCounts[r.offer_id] = (redemptionCounts[r.offer_id] ?? 0) + 1;
  }

  return (
    <main className={`max-w-4xl mx-auto px-6 py-10 w-full ${isNativeApp ? "min-h-[100.5dvh]" : ""}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-100">Partner Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your business listing and offers.
        </p>
      </div>

      <PartnerDashboardClient
        initialBusinesses={businesses}
        initialOffers={(offers ?? []) as DashboardOffer[]}
        initialLocations={(businessLocations ?? []) as DashboardLocation[]}
        redemptionCounts={redemptionCounts}
        allCampaigns={allCampaigns}
        initialCampaignIdsByBusiness={campaignIdsByBusiness}
        isSiteAdmin={isSiteAdmin}
      />
    </main>
  );
}
