import { Stage, Chip, Arrow, ActionButton, type WalkthroughDef } from "@/components/walkthrough/parts";
import { organizer } from "./organizer";

/** Pull shared steps from the main organizer guide so the copy stays in one place. */
function shared(title: string) {
  const step = organizer.steps.find((s) => s.title === title);
  if (!step) throw new Error(`organizer step missing: ${title}`);
  return step;
}

export const eventOrganizer: WalkthroughDef = {
  id: "event-organizer",
  title: "Running this event",
  finishLabel: "Got it",
  steps: [
    {
      title: "You are running this event!",
      label: "Overview",
      body: "This page is your control center. Here is a quick refresher on what to do before, during and after the cleanup.",
      visual: (
        <Stage>
          <Chip>Before</Chip>
          <Arrow />
          <Chip on>Event day</Chip>
          <Arrow />
          <Chip>After</Chip>
        </Stage>
      ),
    },
    {
      title: "Get people to show up",
      label: "Before",
      body: "Share the event and watch the RSVPs come in.",
      how: [
        "Use the share and QR buttons at the top of the page to spread the word",
        "Use Email everyone who RSVP'd to send a reminder",
        "Need to change something? Use the Edit button at the top",
      ],
      visual: (
        <Stage>
          <Chip>Share</Chip>
          <Chip>QR code</Chip>
          <Chip on>Reminder</Chip>
        </Stage>
      ),
    },
    shared("On the day: check people in"),
    {
      title: "Log the cleanup",
      label: "Event day",
      body: "Do this once, after everyone is done. You enter the whole haul and the points are split across everyone who checked in.",
      how: [
        "Count the bags and open Log team total",
        "Choose By bags or By pounds, then enter Small bags and Large bags (or the pounds)",
        "Submit. Points are split across attendees who checked in",
        "Missed someone? Check them in first so they get a share",
        "Use Log for them to credit one person on their own",
      ],
      visual: (
        <Stage>
          <div className="flex flex-col items-center gap-1 rounded-xl bg-zinc-950 px-3 py-2 ring-1 ring-white/10">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Team total</span>
            <span className="text-sm font-bold text-zinc-100">🗑️ 12 small · 4 large</span>
          </div>
          <Arrow />
          <div className="flex flex-col items-center gap-1">
            <span className="text-lg">🧑‍🤝‍🧑</span>
            <span className="text-[10px] font-semibold text-emerald-300">split evenly</span>
          </div>
          <Arrow />
          <div className="flex flex-col gap-1">
            {["Ana", "Ben", "Cy"].map((name) => (
              <span key={name} className="flex items-center justify-between gap-3 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-400/30">
                {name}
                <span>+pts</span>
              </span>
            ))}
          </div>
        </Stage>
      ),
    },
    {
      title: "Photos and routes",
      label: "Event day",
      body: "Photos make the event page come alive, and routes show everyone where you cleaned. Both are optional, and anyone who checked in can add them.",
      how: [
        "Add a photo: tap Add a photo in the Photos section as the cleanup happens",
        "Track my route: you and your attendees can record a GPS path after checking in, even with the phone locked (needs Always location in the app)",
        "Remind people to check in first. Tracking is greyed out until they do",
        "Everyone's routes show on this page afterward",
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
            <path d="M10 14 C24 18 30 8 44 14 S62 30 70 38" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 4" />
            <circle cx="8" cy="46" r="4" fill="#34d399" />
            <circle cx="72" cy="10" r="4" fill="#fbbf24" />
            <circle cx="10" cy="14" r="3" fill="#38bdf8" />
          </svg>
        </Stage>
      ),
    },
    shared("Share the load"),
    shared("Co-host with other groups"),
    {
      title: "Wrap up",
      label: "After",
      body: "Thank everyone and look at what you did together.",
      how: [
        "Check that every attendee is checked in so they get their points",
        "Open your group's Impact stats to see the totals",
        "Then put the next event on the calendar",
      ],
      visual: (
        <Stage>
          <ActionButton tone="emerald">Next event</ActionButton>
        </Stage>
      ),
    },
  ],
};
