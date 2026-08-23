import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/ui/BackButton";
import CampaignDashboardView from "./CampaignDashboardView";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CampaignDashboardPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  const { data: campaign } = await supabase
    .schema("public")
    .from("campaigns")
    .select("id, slug, title")
    .eq("slug", slug)
    .single();

  if (!campaign) notFound();

  const fastapiUrl = process.env.NEXT_PUBLIC_FASTAPI_URL ?? "http://localhost:8000";

  return (
    <main className="max-w-5xl mx-auto px-6 py-10 w-full">
      <div className="mb-2">
        <BackButton href="/admin" label="Admin" />
      </div>
      <h1 className="text-2xl font-black text-zinc-100 mb-1 mt-6">{campaign.title} Dashboard</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Full campaign activity: cleanups, routes, points, trash reports, partners, and geography.
      </p>
      <CampaignDashboardView
        campaignId={campaign.id}
        campaignSlug={campaign.slug}
        campaignName={campaign.title}
        viewerUserId={user.id}
        fastapiUrl={fastapiUrl}
      />
    </main>
  );
}
