import Link from "next/link";
import { notFound } from "next/navigation";
import { Rating } from "@/components/marketplace/MarketplaceHome";
import ReportBlock from "@/components/marketplace/ReportBlock";
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
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold text-zinc-50">{c.username ?? "Cleaner"}</h1>
            <p className="text-sm text-zinc-400">{c.headline}</p>
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
          {c.services.map((s) => (
            <Badge key={s}>{JOB_TYPE_LABELS[s] ?? s}</Badge>
          ))}
        </div>
        {c.bio && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{c.bio}</p>}
      </Card>

      {!own && (
        <Link
          href={`/marketplace/post?cleaner=${c.user_id}`}
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
