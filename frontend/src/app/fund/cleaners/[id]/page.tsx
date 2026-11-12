import Link from "next/link";
import { notFound } from "next/navigation";
import { Rating } from "@/components/marketplace/MarketplaceHome";
import ReportBlock from "@/components/marketplace/ReportBlock";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/PageShell";
import { JOB_TYPE_LABELS, usd, type CleanerCard } from "@/lib/marketplace";
import { MarketplaceApiError, mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function CleanerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, isAdmin } = await requireMarketplace();
  let c: CleanerCard;
  try {
    c = await mkFetch<CleanerCard>(user.id, isAdmin, `/cleaners/${id}`);
  } catch (e) {
    if (e instanceof MarketplaceApiError && e.status === 404) notFound();
    throw e;
  }
  const own = c.user_id === user.id;

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar avatarUrl={c.avatar_url} name={c.username ?? "Cleaner"} size="lg" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-extrabold text-zinc-50">{c.username ?? "Cleaner"}</h1>
              <p className="text-sm text-zinc-400">{c.headline}</p>
            </div>
          </div>
          <p className="shrink-0 text-right font-bold text-emerald-300">
            {c.rate_cents ? `${usd(c.rate_cents)}${c.rate_type === "hourly" ? "/hr" : " / job"}` : "Quote"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Rating avg={c.rating_avg} count={c.rating_count} />
          <span className="text-xs text-zinc-500">{c.jobs_completed} jobs completed</span>
          {c.area_label && <span className="text-xs text-zinc-500">{c.area_label}</span>}
          <span className="text-xs text-zinc-500">Up to {Math.round(c.service_radius_km * 0.621371)} mi</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.rating_count >= 3 && (c.rating_avg ?? 0) >= 4.7 && <Badge>Top rated</Badge>}
          {c.jobs_completed >= 10 && <Badge>10+ jobs done</Badge>}
          {c.jobs_completed >= 1 && c.jobs_completed < 10 && <Badge>Proven on Frontline</Badge>}
          {c.services.map((s) => (
            <Badge key={s}>{JOB_TYPE_LABELS[s] ?? s}</Badge>
          ))}
        </div>
        {c.bio && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{c.bio}</p>}
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {c.years_experience != null && <Fact label="Experience" value={`${c.years_experience} ${c.years_experience === 1 ? "year" : "years"}`} />}
          {c.preferred_size && <Fact label="Prefers" value={c.preferred_size === "any" ? "Any size job" : `${c.preferred_size} jobs`} />}
          {c.languages && c.languages.length > 0 && <Fact label="Languages" value={c.languages.join(", ")} />}
          {c.equipment && c.equipment.length > 0 && <Fact label="Brings" value={c.equipment.join(", ")} />}
          {c.availability && <Fact label="Available" value={c.availability} />}
        </dl>
      </Card>

      {!own && (
        <Link
          href={`/fund/post?cleaner=${c.user_id}`}
          className="flex min-h-11 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-bold text-emerald-950 shadow-elevation-1 touch-manipulation transition-colors hover:bg-emerald-300 active:scale-[0.97]"
        >
          Request a booking
        </Link>
      )}

      <Section title="Reviews">
        {c.reviews && c.reviews.length > 0 ? (
          <ul className="space-y-3">
            {c.reviews.map((r, i) => (
              <li key={i}>
                <Card padding="sm" className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Rating avg={r.rating} count={1} />
                    <span className="text-xs text-zinc-500">{r.username ?? "Customer"}</span>
                  </div>
                  {r.comment && <p className="text-sm text-zinc-300">{r.comment}</p>}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No reviews yet.</p>
        )}
      </Section>

      {!own && <ReportBlock userId={c.user_id} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-900/60 p-2.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="first-letter:uppercase text-zinc-200">{value}</dd>
    </div>
  );
}
