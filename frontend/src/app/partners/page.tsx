import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import PartnersBrowseClient, { type BrowseBusiness, type BrowseOffer } from "./PartnersBrowseClient";
import BusinessApplyPrompt from "./BusinessApplyPrompt";

export default async function PartnersPage() {
  const supabase = await createClient();
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isNativeApp = userAgent.includes("FrontlineNativeApp");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nowIso = new Date().toISOString();

  const [{ data: businesses }, { data: offers }, profileResult] = await Promise.all([
    supabase
      .schema("public")
      .from("partner_businesses")
      .select(
        "id, name, slug, description, logo_url, website_url, social_links, partner_business_locations(id, label, city, state, status)"
      )
      .eq("status", "active")
      .order("name"),
    supabase
      .schema("public")
      .from("partner_offers")
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, starts_at, ends_at, location_id")
      .eq("status", "active")
      .lte("starts_at", nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order("created_at", { ascending: false }),
    user
      ? supabase.schema("public").from("profiles").select("spendable_points, is_business_only").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const isBusinessOnly = profileResult?.data?.is_business_only ?? false;

  const offersByBusiness = new Map<string, BrowseOffer[]>();
  for (const offer of (offers ?? []) as BrowseOffer[]) {
    const list = offersByBusiness.get(offer.business_id) ?? [];
    list.push(offer);
    offersByBusiness.set(offer.business_id, list);
  }

  type RawBusinessRow = {
    id: string; name: string; slug: string; description: string | null; logo_url: string | null;
    website_url: string | null; social_links: Record<string, string> | null;
    partner_business_locations: { id: string; label: string | null; city: string | null; state: string | null; status: string }[];
  };
  const businessesWithLocations: BrowseBusiness[] = ((businesses ?? []) as unknown as RawBusinessRow[]).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logo_url: b.logo_url,
    website_url: b.website_url,
    social_links: b.social_links,
    locations: b.partner_business_locations
      .filter((l) => l.status === "active")
      .map((l) => ({ id: l.id, label: l.label, city: l.city, state: l.state })),
  }));

  const businessesWithOffers = businessesWithLocations.filter(
    (b) => (offersByBusiness.get(b.id) ?? []).length > 0
  );

  return (
    <main className={`max-w-4xl mx-auto px-6 py-10 w-full ${isNativeApp ? "min-h-[100.5dvh]" : ""}`}>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-100">Partner Perks</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Redeem the points you've earned from campaigns for discounts at local partner businesses.
        </p>
      </div>

      <BusinessApplyPrompt />

      {isBusinessOnly && (
        <div className="mb-6 px-4 py-3 rounded-lg border border-sky-900/50 bg-sky-950/30 text-sm text-sky-300 shadow-elevation-1">
          This is what other users see for your business's listing and offers. A business
          only appears here while it has at least one active offer, but it shows up on the
          map at all times regardless of offers.
        </div>
      )}

      <PartnersBrowseClient
        businesses={businessesWithOffers}
        offersByBusiness={Object.fromEntries(offersByBusiness)}
        userId={user?.id ?? null}
        userPoints={profileResult?.data?.spendable_points ?? null}
      />
    </main>
  );
}
