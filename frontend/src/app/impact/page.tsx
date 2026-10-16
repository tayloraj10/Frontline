import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible } from "@/lib/paymentsVisibility";
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

export default async function ImpactPage() {
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

  const summary = await loadSummary();

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="Admin preview"
        title="Impact and funding"
        subtitle="Where the money comes from, where it goes, and what it has cleaned up."
      />

      {!summary ? (
        <EmptyState title="Numbers are unavailable right now" body="Check that the API is running and ADMIN_API_SECRET is set." />
      ) : (
        <>
          <Section title="Impact">
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
