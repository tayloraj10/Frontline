import { ChevronRight, HandCoins, Sparkles } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible } from "@/lib/paymentsVisibility";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import { PageShell, PageHeader } from "@/components/ui/PageShell";
import { createClient } from "@/lib/supabase/server";
import PartnersBrowseClient, { type BrowseBusiness, type BrowseOffer } from "./PartnersBrowseClient";
import BusinessApplyPrompt from "./BusinessApplyPrompt";

export default async function PartnersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nowIso = new Date().toISOString();

  const [{ data: businesses }, { data: offers }, { data: campaignLinks }, { data: activeCampaigns }, profileResult] = await Promise.all([
    supabase
      .schema("public")
      .from("partner_businesses")
      .select(
        "id, name, slug, description, logo_url, website_url, social_links, adults_only, partner_business_locations(id, label, address_line1, city, state, lat, lng, status)"
      )
      .eq("status", "active")
      .order("name"),
    supabase
      .schema("public")
      .from("partner_offers")
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, starts_at, ends_at, location_id, event_eligible")
      .eq("status", "active")
      .lte("starts_at", nowIso)
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
      .order("created_at", { ascending: false }),
    supabase.schema("public").from("campaign_partner_businesses").select("business_id, campaign_id"),
    supabase.schema("public").from("campaigns").select("id").eq("status", "active"),
    user
      ? supabase.schema("public").from("profiles").select("spendable_points, is_business_only, is_admin").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Payments v2 entry points live here (rewards) rather than in the main nav.
  const showPayments = user ? paymentsVisible(await getPaymentsGate(), !!profileResult?.data?.is_admin) : false;

  const activeCampaignIds = new Set((activeCampaigns ?? []).map((c) => c.id));
  const businessIdsInActiveCampaign = new Set(
    (campaignLinks ?? []).filter((l) => activeCampaignIds.has(l.campaign_id)).map((l) => l.business_id)
  );

  const isBusinessOnly = profileResult?.data?.is_business_only ?? false;

  const offersByBusiness = new Map<string, BrowseOffer[]>();
  for (const offer of (offers ?? []) as BrowseOffer[]) {
    const list = offersByBusiness.get(offer.business_id) ?? [];
    list.push(offer);
    offersByBusiness.set(offer.business_id, list);
  }

  type RawBusinessRow = {
    id: string; name: string; slug: string; description: string | null; logo_url: string | null;
    website_url: string | null; social_links: Record<string, string> | null; adults_only: boolean;
    partner_business_locations: { id: string; label: string | null; address_line1: string | null; city: string | null; state: string | null; lat: number; lng: number; status: string }[];
  };
  const businessesWithLocations: BrowseBusiness[] = ((businesses ?? []) as unknown as RawBusinessRow[]).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logo_url: b.logo_url,
    website_url: b.website_url,
    social_links: b.social_links,
    adults_only: b.adults_only,
    locations: b.partner_business_locations
      .filter((l) => l.status === "active")
      .map((l) => ({ id: l.id, label: l.label, address_line1: l.address_line1, city: l.city, state: l.state, lat: l.lat, lng: l.lng })),
  }));

  const businessesWithOffers = businessesWithLocations.filter(
    (b) => (offersByBusiness.get(b.id) ?? []).length > 0 && businessIdsInActiveCampaign.has(b.id)
  );

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Rewards"
        title="Partner perks"
        subtitle="Spend the points you earn from cleanups on discounts at local businesses."
        action={<FlowGuide id="rewards" autoOpen variant="link" label="How rewards work" />}
      />

      <BusinessApplyPrompt />

      {showPayments && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3">
          <Link href="/sponsorships" className="group">
            <Card
              interactive
              padding="sm"
              className="relative h-full overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent max-sm:!p-2 max-sm:flex max-sm:items-center max-sm:gap-2 sm:p-4"
            >
              <span className="flex h-8 w-8 shrink-0 sm:mb-2 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30 transition-transform duration-200 group-hover:scale-110">
                <HandCoins className="h-5 w-5" aria-hidden />
              </span>
              <p className="flex min-w-0 flex-1 items-center justify-between gap-1 text-sm leading-tight font-semibold text-zinc-100">
                Sponsored cleanups
                <ChevronRight className="h-4 w-4 shrink-0 text-emerald-300/70 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </p>
              <p className="mt-0.5 hidden text-xs text-zinc-400 sm:block">Claim a funded site, or fund a cleanup yourself.</p>
            </Card>
          </Link>
          <Link href="/impact" className="group">
            <Card
              interactive
              padding="sm"
              className="relative h-full overflow-hidden border-sky-500/30 bg-gradient-to-br from-sky-500/20 via-sky-500/5 to-transparent max-sm:!p-2 max-sm:flex max-sm:items-center max-sm:gap-2 sm:p-4"
            >
              <span className="flex h-8 w-8 shrink-0 sm:mb-2 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/30 transition-transform duration-200 group-hover:scale-110">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
              <p className="flex min-w-0 flex-1 items-center justify-between gap-1 text-sm leading-tight font-semibold text-zinc-100">
                Impact
                <ChevronRight className="h-4 w-4 shrink-0 text-sky-300/70 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </p>
              <p className="mt-0.5 hidden text-xs text-zinc-400 sm:block">See where sponsor and supporter money goes.</p>
            </Card>
          </Link>
        </div>
      )}

      {isBusinessOnly && (
        <div className="mb-6 px-4 py-3 rounded-2xl bg-sky-950/30 text-sm text-sky-300">
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
    </PageShell>
  );
}
