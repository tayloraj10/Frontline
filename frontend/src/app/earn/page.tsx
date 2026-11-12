import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { rewardsVisible } from "@/lib/paymentsVisibility";
import { PageHeader, PageShell } from "@/components/ui/PageShell";
import RewardsTabs from "@/components/RewardsTabs";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import SponsorshipsPanels from "./SponsorshipsPanels";
import EarnGuideCard from "@/components/marketplace/EarnGuideCard";
import MoneySupport from "@/components/ui/MoneySupport";
import PayoutSetupCard from "./PayoutSetupCard";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";
import { getMarketplaceAccess, mkFetch } from "@/lib/marketplace.server";
import MarketplaceHome from "@/components/marketplace/MarketplaceHome";
import ActiveJobView from "@/components/marketplace/ActiveJobView";
import { payoutsBlocked, type Job, type MeStatus } from "@/lib/marketplace";

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

  const [businessOptions, { allowed: hireOn }] = await Promise.all([
    getSponsorBusinesses(supabase, user.id),
    getMarketplaceAccess(),
  ]);

  let jobsView: React.ReactNode = undefined;
  if (hireOn) {
    const [board, me, mine] = await Promise.all([
      mkFetch<Job[]>(user.id, isAdmin, "/board?limit=20").catch(() => [] as Job[]),
      mkFetch<MeStatus>(user.id, isAdmin, "/me").catch(() => null),
      mkFetch<Job[]>(user.id, isAdmin, "/jobs?role=cleaner").catch(() => [] as Job[]),
    ]);
    const active = mine.find((j) => j.status === "accepted" || j.status === "in_progress");
    jobsView = active ? (
      <ActiveJobView job={active} />
    ) : (
      <MarketplaceHome board={board} profileStatus={me?.cleaner_profile?.status ?? null} payoutsBlocked={payoutsBlocked(me)} embedded />
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        compact
        eyebrow="Rewards"
        title="Earn"
        subtitle={
          hireOn
            ? "Claim a sponsored cleanup or take a neighbor's job, and get paid through Stripe."
            : "Claim a sponsored cleanup and get paid through Stripe."
        }
        titleAction={<FlowGuide id="funding" variant="link" label="How does earning work?" />}
      />
      <RewardsTabs current="paid" />
      <SponsorshipsPanels
        businesses={businessOptions}
        currentUserId={user.id}
        isAdmin={isAdmin}
        fundOnHire={hireOn}
        jobsView={jobsView}
        extras={
          <>
            {hireOn && <EarnGuideCard />}
            <PayoutSetupCard className="mb-4" />
          </>
        }
      />
      <MoneySupport />
    </PageShell>
  );
}
