import { Stage, Chip, PILL, svgProps, Arrow, ActionButton, type WalkthroughDef } from "@/components/walkthrough/parts";

export const trashWar: WalkthroughDef = {
  id: "trash-war",
  title: "How Trash War works",
  finishLabel: "Start cleaning",
  steps: [
    {
      title: "Clean. Earn. Get rewarded.",
      label: "Overview",
      body: "Pick up trash, earn points, and spend them at local shops. Here is a quick tour of the map.",
      visual: (
        <Stage>
          <span className="text-4xl">🧹</span>
          <Chip>Clean</Chip>
          <Chip>Earn</Chip>
          <Chip on>Rewards</Chip>
        </Stage>
      ),
    },
    {
      title: "Log a cleanup",
      label: "Logging",
      body: "Picked up some trash? Log it to earn points.",
      how: [
        "Tap Log Cleanup at the bottom left",
        "Add your bag count and photos",
        "Pin the spot or draw the area you cleaned",
      ],
      visual: (
        <Stage>
          <span className={`${PILL} pl-3.5 pr-4 text-zinc-100`}>
            <svg className="w-4 h-4 text-emerald-400" {...svgProps} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
            Log Cleanup
          </span>
        </Stage>
      ),
    },
    {
      title: "Report trash",
      label: "Reports",
      body: "See a dirty spot but cannot clean it now? Report it so someone else can find it.",
      how: [
        "Tap Report Trash",
        "Place the pin and rate how bad it is",
        "Take a photo (required)",
      ],
      visual: (
        <Stage>
          <span className={`${PILL} px-4 text-zinc-200`}>
            <svg className="w-4 h-4 text-amber-400" {...svgProps}>
              <path d="m10.3 3.9-8.2 14.2A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            Report Trash
          </span>
        </Stage>
      ),
    },
    {
      title: "Join a cleanup event",
      label: "Events",
      body: "Clean with a crew. Group cleanups are scheduled on the map, and everyone who shows up earns points.",
      how: [
        "Tap an event pin on the map",
        "RSVP to save your spot",
        "Show up and log your cleanup with the group",
      ],
      visual: (
        <Stage>
          <span className="flex items-center justify-center w-10 h-10 rounded-full bg-sky-500/20 ring-2 ring-sky-400/60 text-lg">📅</span>
          <Arrow />
          <ActionButton>RSVP</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Spend points on rewards",
      label: "Rewards",
      body: "Local partner shops offer rewards you can unlock with your points.",
      how: [
        "Look for 🎁 pins or shop logos on the map",
        "Tap one to see the offer and what it costs",
        "The pin tells you when you have enough points",
      ],
      visual: (
        <Stage>
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-amber-500/20 ring-2 ring-amber-400/60 text-xl">🎁</span>
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-zinc-900 ring-2 ring-white/20 text-[10px] font-black text-zinc-300">LOGO</span>
        </Stage>
      ),
    },
    {
      title: "Lead a group event",
      label: "Groups",
      body: "Hosting is for group organizers. If you run a group, you will see Host Event next to Report Trash.",
      how: [
        "Tap Host Event",
        "Set the place, time and details",
        "Members RSVP and log the cleanup with you",
      ],
      visual: (
        <Stage>
          <span className={`${PILL} px-4 text-sky-300`}>
            <svg className="w-4 h-4" {...svgProps}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
            Host Event
          </span>
          <Chip>Group organizers</Chip>
        </Stage>
      ),
    },
    {
      title: "Hot spots",
      label: "Bonuses",
      body: "When enough reports pile up in an area it becomes a hot spot. Cleanups inside one earn bonus points while it is active.",
      how: [
        "Look for the glowing zones on the map",
        "Open the Stats tab to see hot spot progress",
        "Log a cleanup inside the zone to earn the bonus",
      ],
      visual: (
        <Stage>
          <span className="flex items-center justify-center w-20 h-20 rounded-full bg-orange-500/10 ring-1 ring-orange-400/40">
            <span className="flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/20 ring-1 ring-orange-400/60 text-lg">🔥</span>
          </span>
          <Chip>Bonus points</Chip>
        </Stage>
      ),
    },
    {
      title: "Claim a report",
      label: "Reports",
      body: "Take on someone's report and race the clock for a score multiplier.",
      how: [
        "Tap any report pin on the map",
        "Tap Claim and head to the spot",
        "Snap a before photo when you arrive",
        "Clean up and snap an after photo before time runs out",
      ],
      beta: true,
      visual: (
        <Stage>
          <span className="relative flex items-center justify-center w-9 h-9 rounded-full bg-amber-500/20 ring-2 ring-amber-400/60">
            <span className="w-3 h-3 rounded-full bg-amber-400" />
          </span>
          <Arrow />
          <ActionButton tone="violet">Claim</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Routes",
      label: "Routes",
      body: "Cleaned a whole stretch? Log it as one route instead of a single pin.",
      how: [
        "Tap Log Cleanup and choose Route",
        "Draw the route on the map, or track it live as you walk",
        "Add your bags and photos as usual",
      ],
      visual: (
        <Stage>
          <svg className="w-40 h-16 text-sky-400" viewBox="0 0 160 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 50 C40 50 40 14 70 14 S110 50 150 20" strokeDasharray="1 7" />
            <circle cx="10" cy="50" r="5" fill="currentColor" />
            <circle cx="150" cy="20" r="5" fill="currentColor" />
          </svg>
        </Stage>
      ),
    },
    {
      title: "Layers and zip leaders",
      label: "Map",
      body: "See where cleanup activity is concentrated and who leads each area.",
      how: [
        "Tap Layers at the top of the map",
        "Pick Zip codes, Neighborhoods or Cities for stats",
        "Turn on Zip code leaders to color areas by who leads",
      ],
      visual: (
        <Stage>
          <Chip on>Zip codes</Chip>
          <Chip>Boroughs</Chip>
          <Chip>Leaders</Chip>
        </Stage>
      ),
    },
    {
      title: "Leaderboard and groups",
      label: "Competition",
      body: "Track your rank and your group's rank, and stack points with friends.",
      how: [
        "Swipe up the tray at the bottom of the map",
        "Open Leaderboard to compare people and groups",
        "Join or start a group from the Groups page",
      ],
      visual: (
        <Stage>
          <Chip>Stats</Chip>
          <Chip on>Leaderboard</Chip>
          <Chip>Activity</Chip>
        </Stage>
      ),
    },
  ],
};
