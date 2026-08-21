import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import BackButton from "@/components/ui/BackButton";
import type { BrowseOffer } from "../PartnersBrowseClient";
import PartnerDetailClient, { type DetailBusiness, type DetailLocation } from "./PartnerDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicClient();
  const { data: business } = await supabase
    .schema("public")
    .from("partner_businesses")
    .select("name, description, logo_url")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!business) return {};

  const title = business.name;
  const description = business.description ?? `${business.name} — Frontline partner.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/partners/${slug}`,
      ...(business.logo_url && { images: [business.logo_url] }),
    },
    twitter: {
      title,
      description,
      ...(business.logo_url && { images: [business.logo_url] }),
    },
  };
}

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nowIso = new Date().toISOString();

  type RawBusinessRow = {
    id: string; name: string; slug: string; description: string | null; logo_url: string | null;
    website_url: string | null; social_links: Record<string, string> | null;
    partner_business_locations: {
      id: string; label: string | null; address_line1: string | null; address_line2: string | null;
      city: string | null; state: string | null; postal_code: string | null; country: string | null;
      lat: number; lng: number; google_maps_url: string | null; status: string;
    }[];
  };

  const [{ data: business }, profileResult] = await Promise.all([
    supabase
      .schema("public")
      .from("partner_businesses")
      .select(
        "id, name, slug, description, logo_url, website_url, social_links, partner_business_locations(id, label, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, status)"
      )
      .eq("slug", slug)
      .eq("status", "active")
      .single(),
    user
      ? supabase.schema("public").from("profiles").select("spendable_points").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!business) notFound();

  const rawBusiness = business as unknown as RawBusinessRow;

  const { data: campaignLinks } = await supabase
    .schema("public")
    .from("campaign_partner_businesses")
    .select("campaigns(slug, title)")
    .eq("business_id", rawBusiness.id);

  const businessWithCampaign: DetailBusiness = {
    id: rawBusiness.id,
    name: rawBusiness.name,
    slug: rawBusiness.slug,
    description: rawBusiness.description,
    logo_url: rawBusiness.logo_url,
    website_url: rawBusiness.website_url,
    social_links: rawBusiness.social_links,
    locations: rawBusiness.partner_business_locations
      .filter((l) => l.status === "active")
      .map((l): DetailLocation => ({
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
    campaigns: (campaignLinks ?? [])
      .map((row) => row.campaigns as unknown as { slug: string; title: string } | null)
      .filter((c): c is { slug: string; title: string } => !!c),
  };

  const { data: offers } = await supabase
    .schema("public")
    .from("partner_offers")
    .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, starts_at, ends_at, location_id")
    .eq("business_id", rawBusiness.id)
    .eq("status", "active")
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <BackButton href="/partners" label="All partners" />
      <div className="mt-4">
        <PartnerDetailClient
          business={businessWithCampaign}
          offers={(offers ?? []) as BrowseOffer[]}
          userId={user?.id ?? null}
          userPoints={profileResult?.data?.spendable_points ?? null}
        />
      </div>
    </main>
  );
}
