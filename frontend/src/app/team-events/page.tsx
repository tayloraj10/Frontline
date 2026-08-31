import Link from "next/link";
import { listTeamEvents, type TeamEventListItem } from "@/lib/teamEvents";

function formatDateRange(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const startStr = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (!endsAt) return `Starts ${startStr}`;
  const end = new Date(endsAt);
  const endStr = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startStr} – ${endStr}`;
}

const STATUS_BADGE: Record<TeamEventListItem["status"], string> = {
  active: "bg-emerald-900/60 text-emerald-400 border-emerald-800",
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  completed: "bg-zinc-800 text-zinc-400 border-zinc-700",
  cancelled: "bg-red-900/60 text-red-400 border-red-800",
};

const STATUS_LABEL: Record<TeamEventListItem["status"], string> = {
  active: "Live now",
  draft: "Draft",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function TeamEventsPage() {
  const events = await listTeamEvents().catch(() => [] as TeamEventListItem[]);
  const visible = events.filter((e) => e.status === "active" || e.status === "completed");
  const active = visible.filter((e) => e.status === "active");
  const completed = visible.filter((e) => e.status === "completed");

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
          Team Events
        </h1>
        <p className="text-zinc-500 mt-2 text-sm">
          Join a team, log cleanups while the event is live, and climb the scoreboard together.
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-28 text-zinc-600">
          <p className="text-5xl mb-4">🏁</p>
          <p className="font-semibold text-zinc-500">No team events right now.</p>
          <p className="text-sm mt-1">Check back soon — new competitions are announced here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">Live now</h2>
              <div className="space-y-3">
                {active.map((event) => (
                  <TeamEventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Past events</h2>
              <div className="space-y-3">
                {completed.map((event) => (
                  <TeamEventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function TeamEventCard({ event }: { event: TeamEventListItem }) {
  return (
    <Link
      href={`/team-events/${event.id}`}
      className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-elevation-1 transition-[background-color,border-color,transform] duration-150 hover:border-zinc-600 active:scale-[0.99] touch-manipulation"
    >
      {event.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.image_url}
          alt=""
          className="w-12 h-12 shrink-0 rounded-full object-cover border border-zinc-700"
        />
      ) : (
        <div
          className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-xl border ${
            event.status === "active"
              ? "bg-emerald-900/40 border-emerald-700/50"
              : "bg-zinc-800 border-zinc-700"
          }`}
        >
          🏁
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-zinc-100 break-words">{event.title}</p>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${STATUS_BADGE[event.status]}`}>
            {STATUS_LABEL[event.status]}
          </span>
        </div>
        <p className="text-zinc-500 text-xs mt-0.5">{formatDateRange(event.starts_at, event.ends_at)}</p>
      </div>
      <span className="shrink-0 text-zinc-600 text-sm">→</span>
    </Link>
  );
}
