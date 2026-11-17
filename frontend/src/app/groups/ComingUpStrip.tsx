import Link from "next/link";
import MarqueeText from "./MarqueeText";

export type ComingUpEvent = {
  id: string;
  title: string;
  scheduledStart: string | null;
  groupName: string;
  groupImageUrl: string | null;
};

const formatStart = (start: string | null) =>
  start
    ? new Date(start).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Date TBD";

function GroupLogo({ event, className }: { event: ComingUpEvent; className: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 ${className}`}>
      {event.groupImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.groupImageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold text-zinc-300">{(event.groupName || "?")[0].toUpperCase()}</span>
      )}
    </div>
  );
}

// Compact "what's next across all groups" strip for the top of /groups, so
// people don't have to open each group page to find upcoming events.
//   1 event  -> one full-width card
//   2 events -> two cards that exactly fill the row
//   3+       -> ~2.5 cards visible so the next one peeks and the row scrolls
export default function ComingUpStrip({ events }: { events: ComingUpEvent[] }) {
  if (events.length === 0) return null;

  const single = events.length === 1;
  const itemWidth = single
    ? "w-full"
    : events.length === 2
      ? "w-[calc((100%-0.75rem)/2)]"
      : "w-[calc((100%-1.5rem)/2.5)]";

  return (
    <section className="mb-6 sm:mb-8" aria-label="Upcoming group events">
      <h2 className="mb-2 font-display text-base font-extrabold tracking-tight text-zinc-100">
        Coming up <span className="font-normal text-zinc-500">({events.length})</span>
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:scroll-pl-0 sm:px-0">
        {events.map((e) => (
          <li key={e.id} className={`${itemWidth} shrink-0 snap-start`}>
            <Link
              href={`/cleanup-events/${e.id}`}
              className="relative flex h-full min-h-[4.5rem] flex-col justify-center rounded-2xl bg-zinc-900 p-3 ring-1 ring-inset ring-white/5 transition-[background-color,transform] duration-150 hover:bg-zinc-800/70 active:scale-[0.98] active:bg-zinc-800 touch-manipulation"
            >
              {single ? (
                <div className="flex items-center gap-3">
                  <GroupLogo event={e} className="h-12 w-12 text-sm" />
                  <div className="min-w-0">
                    <MarqueeText text={e.title} className="text-sm font-semibold text-zinc-100" />
                    <p className="truncate text-xs text-sky-400">{formatStart(e.scheduledStart)}</p>
                    <MarqueeText text={e.groupName} className="text-xs text-zinc-500" />
                  </div>
                </div>
              ) : (
                <div className="min-w-0">
                  <MarqueeText text={e.title} className="text-sm font-semibold text-zinc-100" />
                  <p className="truncate text-xs text-sky-400">{formatStart(e.scheduledStart)}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <GroupLogo event={e} className="h-4 w-4 [&>span]:text-[8px]" />
                    <MarqueeText text={e.groupName} className="min-w-0 flex-1 text-xs text-zinc-500" />
                  </div>
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
