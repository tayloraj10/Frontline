import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";

const SITE_URL = "https://www.frontlinemaps.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();

  const [{ data: campaigns }, { data: groups }, { data: businesses }] = await Promise.all([
    supabase.schema("public").from("campaigns").select("slug, created_at"),
    supabase.from("groups").select("slug, updated_at").eq("status", "approved"),
    supabase.schema("public").from("partner_businesses").select("slug, created_at").eq("status", "active"),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/campaigns`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/groups`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/partners`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: "daily", priority: 0.5 },
  ];

  const campaignRoutes: MetadataRoute.Sitemap = (campaigns ?? []).map((c) => ({
    url: `${SITE_URL}/campaigns/${c.slug}`,
    lastModified: c.created_at ?? undefined,
    changeFrequency: "hourly",
    priority: 0.9,
  }));

  const groupRoutes: MetadataRoute.Sitemap = (groups ?? []).map((g) => ({
    url: `${SITE_URL}/groups/${g.slug}`,
    lastModified: g.updated_at ?? undefined,
    changeFrequency: "daily",
    priority: 0.6,
  }));

  const partnerRoutes: MetadataRoute.Sitemap = (businesses ?? []).map((b) => ({
    url: `${SITE_URL}/partners/${b.slug}`,
    lastModified: b.created_at ?? undefined,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...campaignRoutes, ...groupRoutes, ...partnerRoutes];
}
