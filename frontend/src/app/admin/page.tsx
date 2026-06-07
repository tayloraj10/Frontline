import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminPanel from "./AdminPanel";
import type { Campaign, ActiveEvent, Trigger } from "./AdminPanel";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  const [
    { data: campaigns },
    { data: activeEvents },
    { data: triggers },
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, slug, title, description, campaign_type, contribution_type, geo_unit, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_events")
      .select("id, event_type, title, description, status, started_at, ends_at, campaign_id, campaigns(title, slug)")
      .in("status", ["active", "paused"])
      .order("started_at", { ascending: false }),
    supabase
      .from("event_triggers")
      .select("id, name, condition_type, event_type, cooldown_hours, is_active, campaign_id, campaigns(title, slug)")
      .order("campaign_id"),
  ]);

  return (
    <AdminPanel
      initialCampaigns={(campaigns ?? []) as Campaign[]}
      initialEvents={(activeEvents ?? []) as unknown as ActiveEvent[]}
      initialTriggers={(triggers ?? []) as unknown as Trigger[]}
    />
  );
}
