import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BrowseBusiness, BrowseOffer } from "../PartnersBrowseClient";
import PartnerDetailClient from "./PartnerDetailClient";

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

  const [{ data: business }, profileResult] = await Promise.all([
    supabase
      .schema("public")
      .from("partner_businesses")
      .select(
        "id, name, slug, description, logo_url, website_url, city, state, address_line1, address_line2, postal_code, country, lat, lng, google_maps_url, social_links"
      )
      .eq("slug", slug)
      .eq("status", "active")
      .single(),
    user
      ? supabase.schema("public").from("profiles").select("spendable_points").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (!business) notFound();

  const { data: offers } = await supabase
    .schema("public")
    .from("partner_offers")
    .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, starts_at, ends_at")
    .eq("business_id", (business as BrowseBusiness).id)
    .eq("status", "active")
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
    .order("created_at", { ascending: false });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <Link href="/partners" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        ← All partners
      </Link>
      <div className="mt-4">
        <PartnerDetailClient
          business={business as BrowseBusiness}
          offers={(offers ?? []) as BrowseOffer[]}
          userId={user?.id ?? null}
          userPoints={profileResult?.data?.spendable_points ?? null}
        />
      </div>
    </main>
  );
}
