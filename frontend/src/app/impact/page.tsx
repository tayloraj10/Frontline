import Image from "next/image";
import { Banknote, Recycle, Trash2, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible } from "@/lib/paymentsVisibility";
import RewardsTabs from "@/components/RewardsTabs";
import FlowGuide from "@/components/walkthrough/FlowGuide";
import SubscriptionWidget from "@/components/billing/SubscriptionWidget";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, PageShell, Section } from "@/components/ui/PageShell";
import StatTile from "@/components/ui/StatTile";

export const metadata = { title: "Impact and funding - Frontline" };

interface ImpactSummary {
  money: {
    sponsored_cents: number;
    sponsorship_count: number;
    active_supporters: number;
    donated_cents: number;
    donation_count: number;
    monthly: { month: string; gifts_cents: number; new_supporters: number }[];
    paid_out_cents: number;
  };
  impact: { cleanups_completed: number; bags_collected: number; pounds_collected: number; participants: number };
  groups?: { active_groups: number; members: number; cleanups: number; bags: number };
  partners: { id: string; name: string; slug: string; logo_url: string | null; website_url: string | null }[];
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
const num = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

async function loadSummary(): Promise<ImpactSummary | null> {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) return null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/payments/impact-summary`, {
      headers: { "X-Admin-Api-Secret": secret },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as ImpactSummary) : null;
  } catch {
    return null;
  }
}

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const youTab = tab === "you";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, paymentsGate] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single(),
    getPaymentsGate(),
  ]);
  if (!paymentsVisible(paymentsGate, !!profile?.is_admin)) redirect("/");

  const summary = youTab ? null : await loadSummary();

  // The You tab: this person's own lifetime and this-year totals, from their contributions.
  let mine: {
    bagsAll: number;
    bagsYear: number;
    bagsMonth: number;
    cleanupsAll: number;
    cleanupsYear: number;
    cleanupsMonth: number;
    username: string | null;
  } | null = null;
  if (youTab) {
    const [{ data: rows }, { data: me }] = await Promise.all([
      supabase
        .schema("public")
        .from("contributions")
        .select("submitted_at, cleanups!cleanup_id(metrics_small_bags, metrics_large_bags)")
        .eq("user_id", user.id),
      supabase.schema("public").from("profiles").select("username").eq("id", user.id).single(),
    ]);
    const now = new Date();
    const year = String(now.getFullYear());
    const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    mine = { bagsAll: 0, bagsYear: 0, bagsMonth: 0, cleanupsAll: 0, cleanupsYear: 0, cleanupsMonth: 0, username: me?.username ?? null };
    for (const r of rows ?? []) {
      const c = r.cleanups as unknown as { metrics_small_bags: number | null; metrics_large_bags: number | null } | null;
      if (!c) continue;
      const bags = (c.metrics_small_bags ?? 0) + (c.metrics_large_bags ?? 0);
      mine.bagsAll += bags;
      mine.cleanupsAll += 1;
      if (String(r.submitted_at ?? "").startsWith(year)) {
        mine.bagsYear += bags;
        mine.cleanupsYear += 1;
      }
      if (String(r.submitted_at ?? "").startsWith(month)) {
        mine.bagsMonth += bags;
        mine.cleanupsMonth += 1;
      }
    }
  }

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Rewards"
        title="Impact"
        subtitle="What your money did, your Plus plan, and where funding goes."
        titleAction={<FlowGuide id="impact" variant="link" label="How does Impact work?" />}
      />

      <RewardsTabs current="impact" />

      <nav aria-label="Impact view" className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-zinc-900 p-1 ring-1 ring-inset ring-zinc-800/60">
        {[
          { id: "community", label: "Community", href: "/impact", active: !youTab },
          { id: "you", label: "You", href: "/impact?tab=you", active: youTab },
        ].map((t) => (
          <Link
            key={t.id}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`flex min-h-10 items-center justify-center rounded-xl text-[13px] font-bold touch-manipulation transition-colors ${
              t.active ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-inset ring-emerald-400/30" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {(youTab ? !!mine : !!summary) && (
        <section className="relative mb-5 overflow-hidden rounded-[24px] bg-gradient-to-br from-emerald-500/30 via-emerald-900/30 to-sky-500/20 p-5 ring-1 ring-inset ring-emerald-400/25 lg:p-7">
          <Recycle aria-hidden="true" className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-emerald-300/10" />
          <div className="relative lg:grid lg:grid-cols-2 lg:gap-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-200/80">
                {youTab ? "This month you helped" : "Together we have"}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-3 lg:gap-6">
                {(youTab
                  ? [
                      { v: num(mine!.bagsMonth), l: "bags collected", Icon: Trash2 },
                      { v: num(mine!.cleanupsMonth), l: "cleanups", Icon: Recycle },
                      { v: num(mine!.bagsYear), l: "bags this year", Icon: Trash2 },
                    ]
                  : [
                      { v: num(summary!.impact.bags_collected), l: "bags collected", Icon: Trash2 },
                      { v: usd(summary!.money.paid_out_cents), l: "paid to neighbors", Icon: Banknote },
                      { v: num(summary!.impact.cleanups_completed), l: "cleanups", Icon: Recycle },
                    ]
                ).map(({ Icon, ...x }) => (
                  <div key={x.l} className="min-w-0">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-300/15 text-emerald-200">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="mt-3 truncate font-display text-3xl font-extrabold leading-none text-zinc-50 lg:text-4xl">{x.v}</p>
                    <p className="mt-1.5 text-xs font-semibold text-emerald-200">{x.l}</p>
                  </div>
                ))}
              </div>
            </div>
            {!youTab && summary!.groups && (
              <div className="mt-5 border-t border-emerald-300/15 pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-sky-200/80">
                  <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
                  Through groups
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 lg:gap-6">
                  {[
                    { v: num(summary!.groups.active_groups), l: "active groups", Icon: UsersRound },
                    { v: num(summary!.groups.members), l: "members", Icon: Users },
                    { v: num(summary!.groups.cleanups), l: "group cleanups", Icon: Recycle },
                  ].map(({ Icon, ...x }) => (
                    <div key={x.l} className="min-w-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-300/15 text-sky-200">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <p className="mt-3 truncate font-display text-3xl font-extrabold leading-none text-zinc-50 lg:text-4xl">{x.v}</p>
                      <p className="mt-1.5 text-xs font-semibold text-sky-200">{x.l}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="relative mt-4 text-sm text-zinc-300">
            {youTab
              ? "Thank you for showing up."
              : `${num(summary!.impact.participants)} people have joined in so far.`}
          </p>
        </section>
      )}

      {youTab && mine ? (
        <>
          <Section title="Your part">
            <div className="grid grid-cols-2 gap-3">
              <StatTile hero value={num(mine.bagsYear)} label="Bags this year" />
              <StatTile hero value={num(mine.cleanupsYear)} label="Cleanups this year" />
              <StatTile value={num(mine.bagsAll)} label="Bags all time" />
              <StatTile value={num(mine.cleanupsAll)} label="Cleanups all time" />
            </div>
          </Section>
          {mine.username && (
            <Link href={`/users/${mine.username}`}>
              <Card interactive padding="lg">
                <p className="font-display text-base font-extrabold text-zinc-100">Monthly recap</p>
                <p className="mt-1 text-sm text-zinc-400">Your shareable month in review lives on your profile.</p>
              </Card>
            </Link>
          )}
        </>
      ) : !summary ? (
        <EmptyState title="Numbers are unavailable right now" body="Please try again in a few minutes." />
      ) : (
        <>
          <Section title="Community impact">
            <div className="grid grid-cols-2 gap-3">
              <StatTile hero value={num(summary.impact.cleanups_completed)} label="Cleanups" />
              <StatTile hero value={num(summary.impact.bags_collected)} label="Bags collected" />
              <StatTile value={num(summary.impact.pounds_collected)} label="Pounds" />
              <StatTile value={num(summary.impact.participants)} label="Participants" />
            </div>
          </Section>

          <Section title="Funding">
            <div className="grid grid-cols-2 gap-3">
              <StatTile hero value={usd(summary.money.donated_cents)} label="Donated" />
              <StatTile hero value={usd(summary.money.sponsored_cents)} label="Sponsored" />
              <StatTile value={num(summary.money.active_supporters)} label="Plus supporters" />
              <StatTile value={usd(summary.money.paid_out_cents)} label="Paid out" />
            </div>
            <Card padding="lg" className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Gifts by month</p>
              <div className="mt-3 flex h-24 items-end gap-1.5">
                {summary.money.monthly.map((m) => {
                  const max = Math.max(1, ...summary.money.monthly.map((x) => x.gifts_cents));
                  return (
                    <div key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${m.month}: ${usd(m.gifts_cents)}, ${m.new_supporters} new supporters`}>
                      <div className="w-full rounded-t bg-emerald-400" style={{ height: `${Math.max(2, (m.gifts_cents / max) * 100)}%` }} />
                      <span className="text-[9px] text-zinc-500">{m.month.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-zinc-500">One-time donations and sponsorships, last 12 months.</p>
            </Card>
            <p className="mt-3 text-xs text-zinc-500">
              Sponsor money funds cleanup programs. Cleaners are credited only after verified work and an admin review.
            </p>
          </Section>

          <Section title="Partners">
            {summary.partners.length === 0 ? (
              <EmptyState title="No partners yet" />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {summary.partners.map((p) => (
                  <Link key={p.id} href={`/partners/${p.slug}`}>
                    <Card interactive className="flex min-h-24 flex-col items-center justify-center gap-2 text-center">
                      {p.logo_url && (
                        <Image src={p.logo_url} alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" unoptimized />
                      )}
                      <span className="text-sm font-semibold text-zinc-100">{p.name}</span>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="Sponsor a group">
        <Link href="/groups">
          <Card interactive padding="lg">
            <p className="font-display text-base font-extrabold text-zinc-100">Sponsor a group</p>
            <p className="mt-1 text-sm text-zinc-400">
              Fund cleanups for your crew or block. They get a public thank-you and a progress bar.
            </p>
            <span className="mt-3 inline-flex min-h-10 items-center rounded-full bg-zinc-800 px-4 text-sm font-semibold text-zinc-100">
              Choose a group
            </span>
          </Card>
        </Link>
      </Section>

      <Section title="Frontline Plus">
        <Card padding="lg" className="mb-4">
          <p className="font-display text-base font-extrabold text-zinc-100">About $5 a month</p>
          <p className="mt-1 text-sm text-zinc-400">
            A monthly gift that keeps the app running and funds cleanups, with personal impact analytics and a supporter
            badge as a thank you.
          </p>
        </Card>
        <SubscriptionWidget ownerType="user" ownerId={user.id} adminPreview={!!profile?.is_admin && !paymentsGate.enabled} />
      </Section>
    </PageShell>
  );
}
