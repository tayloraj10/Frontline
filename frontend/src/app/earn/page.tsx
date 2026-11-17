import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/serverUser";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { rewardsVisible } from "@/lib/paymentsVisibility";
import { PageHeader, PageShell } from "@/components/ui/PageShell";
import LoginPrompt from "@/components/ui/LoginPrompt";
import RewardsTabs from "@/components/RewardsTabs";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import SponsorshipsPanels from "./SponsorshipsPanels";
import AwaitingReview from "./AwaitingReview";
import EarnGuideCard from "@/components/marketplace/EarnGuideCard";
import MoneySupport from "@/components/ui/MoneySupport";
import PayoutSetupCard from "./PayoutSetupCard";
import DailyLimitNote from "@/components/billing/DailyLimitNote";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";
import { getMarketplaceAccess, mkFetch } from "@/lib/marketplace.server";
import MarketplaceHome from "@/components/marketplace/MarketplaceHome";
import ActiveJobView from "@/components/marketplace/ActiveJobView";
import StepTimer from "@/components/marketplace/StepTimer";
import SiteDetail from "./sites/[id]/SiteDetail";
import { payoutsBlocked, type Job, type MeStatus } from "@/lib/marketplace";

export default async function SponsorshipsPage() {
  const supabase = await createClient();

  const user = await getServerUser();

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
  let activeJob: Job | undefined;
  if (hireOn) {
    const uid = user?.id ?? "";
    const [board, me, mine] = await Promise.all([
      mkFetch<Job[]>(uid, isAdmin, "/board?limit=20").catch(() => [] as Job[]),
      user ? mkFetch<MeStatus>(uid, isAdmin, "/me").catch(() => null) : Promise.resolve(null),
      user ? mkFetch<Job[]>(uid, isAdmin, "/jobs?role=cleaner").catch(() => [] as Job[]) : Promise.resolve([] as Job[]),
    ]);
    activeJob = mine.find((j) => j.status === "accepted" || j.status === "in_progress");
    jobsView = (
      <MarketplaceHome board={board} profileStatus={me?.cleaner_profile?.status ?? null} payoutsBlocked={payoutsBlocked(me)} embedded />
    );
  }

  // A claimed sponsored site is the earner's one active task, so it takes over the page like an active job.
  let activeSiteId: string | null = null;
  let siteTimer: { deadline: string; label: string } | null = null;
  if (user && !activeJob) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorships/sites?user_id=${user.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const body = (await res.json()) as {
            sites?: { id: string; my_claim: { status: string; before_deadline_at: string | null; after_deadline_at: string | null } | null }[];
          };
          const mine = body.sites?.find((s) => s.my_claim);
          activeSiteId = mine?.id ?? null;
          const c = mine?.my_claim;
          if (c) {
            const starting = c.status === "claimed";
            const due = starting ? c.before_deadline_at : c.after_deadline_at;
            if (due) siteTimer = { deadline: due, label: starting ? "to take your before photo" : "to finish and submit" };
          }
        }
      }
    } catch {
      activeSiteId = null;
    }
  }

  const hasActive = !!(activeJob || activeSiteId);
  const timer = activeJob ? (
    activeJob.status === "accepted" && activeJob.arrive_by ? (
      <StepTimer deadline={activeJob.arrive_by} label="to arrive and start" startsAt={activeJob.starts_at ?? activeJob.window_start} />
    ) : null
  ) : siteTimer ? (
    <StepTimer deadline={siteTimer.deadline} label={siteTimer.label} />
  ) : null;

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
      {hasActive && (
        <div className="mb-4">
          {timer && (
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-zinc-100">Your active task</span>
              {timer}
            </div>
          )}
          {activeJob ? <ActiveJobView job={activeJob} /> : <SiteDetail id={activeSiteId!} loggedIn />}
        </div>
      )}
      {!user && <LoginPrompt action="claim sites, take jobs and get paid" className="mb-4" />}
      <SponsorshipsPanels
        businesses={businessOptions}
        currentUserId={user?.id ?? ""}
        isAdmin={isAdmin}
        fundOnHire={hireOn}
        jobsView={jobsView}
        hasActive={hasActive}
        extras={
          <>
            {hireOn && <EarnGuideCard />}
            {user && <AwaitingReview />}
            {user && <PayoutSetupCard className="mb-4" />}
            {user && <DailyLimitNote className="mb-4" />}
          </>
        }
      />
      <MoneySupport />
    </PageShell>
  );
}
