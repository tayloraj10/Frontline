import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible } from "@/lib/paymentsVisibility";
import { PageHeader, PageShell } from "@/components/ui/PageShell";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import SponsoredMap from "./SponsoredMap";
import SponsoredSites from "./SponsoredSites";
import SponsorshipsHub from "./SponsorshipsHub";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";

export default async function SponsorshipsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, paymentsGate] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single(),
    getPaymentsGate(),
  ]);
  const isAdmin = !!profile?.is_admin;
  if (!paymentsVisible(paymentsGate, isAdmin)) redirect("/");

  const businessOptions = await getSponsorBusinesses(supabase, user.id);

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="Admin preview"
        title="Sponsorships"
        subtitle="Fund cleanups or the mission. Test mode only, no payouts yet."
        action={<FlowGuide id="funding" variant="link" label="How does funding work?" />}
      />
      <SponsoredMap />
      <SponsoredSites />
      <SponsorshipsHub businesses={businessOptions} currentUserId={user.id} isAdmin={isAdmin} />
    </PageShell>
  );
}
