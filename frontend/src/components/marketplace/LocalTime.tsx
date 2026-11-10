"use client";

/** Renders a timestamp in the viewer's timezone. The server renders its own zone first, so the text is allowed to differ on hydrate. */
export default function LocalTime({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} suppressHydrationWarning className="font-semibold text-zinc-100">
      {new Date(iso).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
    </time>
  );
}
