import { createClient } from "@/lib/supabase/server";
import PartnersBrowseClient, { type BrowseBusiness, type BrowseOffer } from "./PartnersBrowseClient";

export default async function PartnersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nowIso = new Date().toISOString();

  const [{ data: businesses }, { data: offers }, profileResult] = await Promise.all([
    supabase
      .schema("public")
      .from("partner_businesses")
      .select(
        "id, name, slug, description, logo_url, website_url, city, state, address_line1, address_line2, postal_code, country, lat, lng, google_maps_url, social_links"
      )
      .eq("status", "active")
      .order("name"),
    supabase
      .schema("public")
      .from("partner_offers")
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, starts_at, ends_at")
      .eq("status", "active")
      .lte("starts_at", nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order("created_at", { ascending: false }),
    user
      ? supabase.schema("public").from("profiles").select("spendable_points").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const offersByBusiness = new Map<string, BrowseOffer[]>();
  for (const offer of (offers ?? []) as BrowseOffer[]) {
    const list = offersByBusiness.get(offer.business_id) ?? [];
    list.push(offer);
    offersByBusiness.set(offer.business_id, list);
  }

  const businessesWithOffers = ((businesses ?? []) as BrowseBusiness[]).filter(
    (b) => (offersByBusiness.get(b.id) ?? []).length > 0
  );

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-zinc-100">Partner Perks</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Redeem the points you've earned from campaigns for discounts at local partner businesses.
        </p>
      </div>

      <PartnersBrowseClient
        businesses={businessesWithOffers}
        offersByBusiness={Object.fromEntries(offersByBusiness)}
        userId={user?.id ?? null}
        userPoints={profileResult?.data?.spendable_points ?? null}
      />
    </main>
  );
}
