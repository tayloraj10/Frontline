import { Stage, Chip, Arrow, ActionButton, type WalkthroughDef } from "@/components/walkthrough/parts";

export const attendee: WalkthroughDef = {
  id: "attendee",
  title: "How to join a cleanup event",
  finishLabel: "Got it",
  steps: [
    {
      title: "Clean up with a group",
      label: "Overview",
      body: "Events are cleanups hosted by local groups. Show up, help out and earn points for it.",
      visual: (
        <Stage>
          <span className="text-4xl">🧹</span>
          <Chip>RSVP</Chip>
          <Chip>Check in</Chip>
          <Chip on>Points</Chip>
        </Stage>
      ),
    },
    {
      title: "RSVP so the organizer knows",
      label: "Before",
      body: "Let the group know if you are coming. You can change your answer any time.",
      how: [
        "Log in if you have not yet",
        "Pick Going, Maybe or Can't go",
        "Some events fill up, so RSVP early",
      ],
      visual: (
        <Stage>
          <Chip on>Going</Chip>
          <Chip>Maybe</Chip>
          <Chip>Can&apos;t go</Chip>
        </Stage>
      ),
    },
    {
      title: "Check in when you arrive",
      label: "Event day",
      body: "Checking in is how you get credit for being there. An RSVP alone is not verified attendance.",
      how: [
        "Allow location when asked",
        "Tap Check in with my location once you are in range",
        "No signal or outside the range? Ask the organizer for the join code and type it in",
      ],
      visual: (
        <Stage>
          <ActionButton tone="emerald">Check in with my location</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Points for showing up",
      label: "Event day",
      body: "Checking in earns points on its own, once per event. Your first ever check-in earns a bonus on top. The event page shows the amount (5 points by default).",
      visual: (
        <Stage>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/40">
            📍 Check in
          </span>
          <Arrow />
          <span className="inline-flex flex-col items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 px-5 py-2 text-zinc-950 shadow-lg shadow-amber-500/30 ring-2 ring-amber-200/60">
            <span className="text-3xl font-black leading-none">+5</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">points 🏅</span>
          </span>
        </Stage>
      ),
    },
    {
      title: "Get credit for your haul",
      label: "Event day",
      body: "How points are logged depends on the event. The badge near the top of the page tells you which.",
      how: [
        "Team log: the organizer enters one total at the end and points are split across attendees",
        "You log yourself: log your bags from the map near the event",
        "Either way you only need to check in first",
      ],
      visual: (
        <Stage>
          <Chip on>Team log</Chip>
          <Arrow />
          <Chip>Your points</Chip>
        </Stage>
      ),
    },
    {
      title: "Photos and your route",
      label: "Extras",
      body: "Once you have checked in, there are two optional extras.",
      how: [
        "Add a photo: tap Add a photo in the Photos section to share the event",
        "Track my route: record your GPS path during the cleanup, even with your phone locked (needs Always location in the app)",
        "Everyone's routes show on the event page afterward",
      ],
      visual: (
        <Stage>
          <div className="grid grid-cols-3 gap-1.5">
            {["bg-emerald-500/30", "bg-sky-500/30", "bg-amber-500/30"].map((c, k) => (
              <span key={k} className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ring-1 ring-white/10 ${c}`}>
                {["🌳", "🗑️", "🧤"][k]}
              </span>
            ))}
          </div>
          <svg viewBox="0 0 80 56" className="h-20 w-28 rounded-xl bg-zinc-900 ring-1 ring-white/10" aria-hidden="true">
            <path d="M8 46 C20 40 18 20 34 24 S52 40 58 16 L72 10" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 5" />
            <path d="M8 46 C20 40 18 20 34 24 S52 40 58 16 L72 10" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
            <circle cx="8" cy="46" r="4" fill="#38bdf8" />
            <circle cx="72" cy="10" r="4" fill="#fbbf24" />
          </svg>
        </Stage>
      ),
    },
  ],
};
