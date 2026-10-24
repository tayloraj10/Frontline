import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { JOB_TYPE_LABELS, usd, type CleanerCard } from "@/lib/marketplace";

const AVATAR_GRADIENTS = [
  "from-emerald-400 to-sky-500",
  "from-amber-400 to-rose-500",
  "from-violet-400 to-pink-500",
  "from-sky-400 to-indigo-500",
];

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />;
  }
  const hash = [...name].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const letters = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]} text-sm font-extrabold text-white shadow-elevation-1`}
    >
      {letters}
    </span>
  );
}

export function Rating({ avg, count }: { avg: number | null; count: number }) {
  if (!count || avg == null) return <span className="text-xs text-zinc-500">New</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
      <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      {Number(avg).toFixed(1)} <span className="font-normal text-zinc-500">({count})</span>
    </span>
  );
}

/** The cleaner card from the Hire mocks: avatar, name and rate, headline, rating, jobs, place, service tags. */
export default function CleanerRow({ c }: { c: CleanerCard }) {
  return (
    <Link href={`/marketplace/cleaners/${c.user_id}`}>
      <Card interactive className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={c.username ?? "Cleaner"} url={c.avatar_url} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate font-bold text-zinc-100">{c.username ?? "Cleaner"}</p>
              <p className="shrink-0 font-display text-lg font-extrabold text-emerald-300">
                {c.rate_cents ? `${usd(c.rate_cents)}${c.rate_type === "hourly" ? "/hr" : ""}` : "Quote"}
              </p>
            </div>
            <p className="truncate text-sm text-zinc-400">{c.headline}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Rating avg={c.rating_avg} count={c.rating_count} />
          <span className="text-xs text-zinc-500">{c.jobs_completed} jobs</span>
          {(c.area_label || c.distance_km != null) && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {[c.area_label, c.distance_km != null ? `${(c.distance_km * 0.621371).toFixed(1)} mi` : null].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
        {c.services.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.services.map((sv) => (
              <Badge key={sv}>{JOB_TYPE_LABELS[sv] ?? sv}</Badge>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
