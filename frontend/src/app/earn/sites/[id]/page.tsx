import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { rewardsVisible } from "@/lib/paymentsVisibility";
import { PageShell } from "@/components/ui/PageShell";
import SiteDetail from "./SiteDetail";

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: profile }, gate] = await Promise.all([
    user
      ? supabase.schema("public").from("profiles").select("is_admin, rewards_beta").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    getPaymentsGate(),
  ]);
  // Same visibility rules as the Earn page: logged-out visitors can look once payments are public.
  if (!user && !(gate.preview && gate.enabled)) redirect("/login");
  if (user && !rewardsVisible(gate, !!profile?.is_admin, !!profile?.rewards_beta)) redirect("/");
  return (
    <PageShell>
      <SiteDetail id={id} loggedIn={!!user} />
    </PageShell>
  );
}
