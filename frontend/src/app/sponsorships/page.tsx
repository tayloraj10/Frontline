import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { rewardsVisible } from "@/lib/paymentsVisibility";
import { PageHeader, PageShell } from "@/components/ui/PageShell";
import RewardsTabs from "@/components/RewardsTabs";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import SponsorshipsPanels from "./SponsorshipsPanels";
import MoneySupport from "@/components/ui/MoneySupport";
import PayoutSetupCard from "./PayoutSetupCard";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";

export default async function SponsorshipsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, paymentsGate] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin, rewards_beta").eq("id", user.id).single(),
    getPaymentsGate(),
  ]);
  const isAdmin = !!profile?.is_admin;
  if (!rewardsVisible(paymentsGate, isAdmin, !!profile?.rewards_beta)) redirect("/");

  const businessOptions = await getSponsorBusinesses(supabase, user.id);

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Rewards"
        title="Earn"
        subtitle="Claim a sponsored cleanup and get paid, or fund one yourself. Get paid to your bank through Stripe."
        titleAction={<FlowGuide id="funding" variant="link" label="How does earning work?" />}
      />
      <RewardsTabs current="paid" />
      <PayoutSetupCard className="mb-4" />
      <SponsorshipsPanels businesses={businessOptions} currentUserId={user.id} isAdmin={isAdmin} />
      <MoneySupport />
    </PageShell>
  );
}
