import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { rewardsVisible } from "@/lib/paymentsVisibility";
import { PageHeader, PageShell } from "@/components/ui/PageShell";
import LoginPrompt from "@/components/ui/LoginPrompt";
import RewardsTabs from "@/components/RewardsTabs";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import SponsorshipsPanels from "./SponsorshipsPanels";
import EarnGuideCard from "@/components/marketplace/EarnGuideCard";
import MoneySupport from "@/components/ui/MoneySupport";
import PayoutSetupCard from "./PayoutSetupCard";
import DailyLimitNote from "@/components/billing/DailyLimitNote";
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

  const [{ data: profile }, paymentsGate] = await Promise.all([
    user
      ? supabase.schema("public").from("profiles").select("is_admin, rewards_beta").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
    getPaymentsGate(),
  ]);
  const isAdmin = !!profile?.is_admin;
  // Logged-out visitors can look around once payments are live for everyone; actions stay locked.
  if (!user && !(paymentsGate.preview && paymentsGate.enabled)) redirect("/login");
  if (user && !rewardsVisible(paymentsGate, isAdmin, !!profile?.rewards_beta)) redirect("/");

  const [businessOptions, { allowed: hireOn }] = await Promise.all([
    user ? getSponsorBusinesses(supabase, user.id) : Promise.resolve([]),
    getMarketplaceAccess(),
  ]);

  let jobsView: React.ReactNode = undefined;
  if (hireOn) {
    const uid = user?.id ?? "";
    const [board, me, mine] = await Promise.all([
      mkFetch<Job[]>(uid, isAdmin, "/board?limit=20").catch(() => [] as Job[]),
      user ? mkFetch<MeStatus>(uid, isAdmin, "/me").catch(() => null) : Promise.resolve(null),
      user ? mkFetch<Job[]>(uid, isAdmin, "/jobs?role=cleaner").catch(() => [] as Job[]) : Promise.resolve([] as Job[]),
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
      {!user && <LoginPrompt action="claim sites, take jobs and get paid" className="mb-4" />}
      <SponsorshipsPanels
        businesses={businessOptions}
        currentUserId={user?.id ?? ""}
        isAdmin={isAdmin}
        fundOnHire={hireOn}
        jobsView={jobsView}
        extras={
          <>
            {hireOn && <EarnGuideCard />}
            {user && <PayoutSetupCard className="mb-4" />}
            {user && <DailyLimitNote className="mb-4" />}
          </>
        }
      />
      <MoneySupport />
    </PageShell>
  );
}
