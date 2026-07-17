import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminPanel from "./AdminPanel";
import type { Campaign, ActiveEvent, Trigger, PartnerBusiness, PartnerOffer, OfferRedemption, BusinessCampaignLink } from "./AdminPanel";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  const [
    { data: campaigns },
    { data: activeEvents },
    { data: triggers },
    { data: businesses },
    { data: offers },
    { data: redemptions },
  ] = await Promise.all([
    supabase
      .schema("public")
      .from("campaigns")
      .select("id, slug, title, description, campaign_type, contribution_type, geo_unit, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_events")
      .select("id, event_type, title, description, image_url, effect_config, status, started_at, ends_at, campaign_id")
      .in("status", ["active", "paused"])
      .order("started_at", { ascending: false }),
    supabase
      .schema("public")
      .from("event_triggers")
      .select("id, name, condition_type, event_type, cooldown_hours, is_active, campaign_id, campaigns(title, slug)")
      .order("campaign_id"),
    supabase
      .schema("public")
      .from("partner_businesses")
      .select(
        "id, name, slug, description, logo_url, website_url, address_line1, address_line2, city, state, postal_code, country, lat, lng, google_maps_url, social_links, status, created_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .schema("public")
      .from("partner_offers")
      .select("id, business_id, title, description, redemption_mode, points_cost, points_threshold, max_redemptions_per_user, max_total_redemptions, code, status, starts_at, ends_at, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .schema("public")
      .from("partner_redemptions")
      .select("offer_id"),
  ]);

  const { data: businessCampaignLinks } = await supabase
    .schema("public")
    .from("campaign_partner_businesses")
    .select("business_id, campaign_id");

  const eventCampaignIds = [...new Set((activeEvents ?? []).map((e) => e.campaign_id).filter(Boolean) as string[])];
  const { data: eventCampaignsData } = eventCampaignIds.length > 0
    ? await supabase.schema("public").from("campaigns").select("id, title, slug").in("id", eventCampaignIds)
    : { data: [] as { id: string; title: string; slug: string }[] };
  const eventCampaignsById = new Map((eventCampaignsData ?? []).map((c) => [c.id, { title: c.title, slug: c.slug }]));
  const eventsWithCampaigns = (activeEvents ?? []).map((e) => ({
    ...e,
    campaigns: e.campaign_id ? eventCampaignsById.get(e.campaign_id) ?? null : null,
  }));

  return (
    <AdminPanel
      initialCampaigns={(campaigns ?? []) as Campaign[]}
      initialEvents={eventsWithCampaigns as unknown as ActiveEvent[]}
      initialTriggers={(triggers ?? []) as unknown as Trigger[]}
      initialBusinesses={(businesses ?? []) as PartnerBusiness[]}
      initialOffers={(offers ?? []) as PartnerOffer[]}
      initialOfferRedemptions={(redemptions ?? []) as OfferRedemption[]}
      initialBusinessCampaignLinks={(businessCampaignLinks ?? []) as BusinessCampaignLink[]}
    />
  );
}
