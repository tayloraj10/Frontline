import { Stage, Chip, Arrow, ActionButton, type WalkthroughDef } from "@/components/walkthrough/parts";

export const organizer: WalkthroughDef = {
  id: "organizer",
  title: "How to run a group event",
  finishLabel: "Got it",
  steps: [
    {
      title: "Run cleanups with your crew",
      label: "Overview",
      body: "A group gets its own page, its own events and a team leaderboard. You plan the event, people show up, and everyone earns points.",
      visual: (
        <Stage>
          <span className="text-4xl">🧑‍🤝‍🧑</span>
          <Chip>Group</Chip>
          <Chip>Event</Chip>
          <Chip on>Points</Chip>
        </Stage>
      ),
    },
    {
      title: "Add your group",
      label: "Setup",
      body: "Tell us about your group and send it in. An admin reviews it before it goes public.",
      how: [
        "Open Add your group",
        "Fill in each step and tap Next",
        "Tap Submit group",
      ],
      visual: (
        <Stage>
          <Chip>Submitted</Chip>
          <Arrow />
          <Chip on>Approved</Chip>
        </Stage>
      ),
    },
    {
      title: "Host your first event",
      label: "Planning",
      body: "Events live on your group page. Pick a place and a time and people can RSVP.",
      how: [
        "Open your group and tap New event",
        "Add a title, a start time and drop a pin on the map",
        "Tap Create event",
      ],
      visual: (
        <Stage>
          <Chip on>Title</Chip>
          <Chip>Time</Chip>
          <Chip>Pin</Chip>
        </Stage>
      ),
    },
    {
      title: "Co-host with other groups",
      label: "Planning",
      body: "Team up with another group on the same event. It shows on both groups' pages and credits everyone.",
      how: [
        "When creating or editing an event, open Co-hosting groups",
        "Search for the groups you want to partner with, or pick from the most active ones",
        "Tap Create event. The event page says in partnership with those groups",
      ],
      visual: (
        <Stage>
          <Chip on>Your group</Chip>
          <span className="text-zinc-500 text-lg">+</span>
          <Chip>Partner group</Chip>
        </Stage>
      ),
    },
    {
      title: "Choose how points are logged",
      label: "Planning",
      body: "You pick this when you create the event, under Schedule & Logging.",
      how: [
        "Organizer logs team total (recommended): you enter the combined haul once and points are split across attendees",
        "Attendees log themselves: everyone logs from the map near the event",
        "Re-entering a team total wipes the earlier split and re-splits the full new total, so always enter the whole haul",
      ],
      visual: (
        <Stage>
          <Chip on>Organizer logs team total</Chip>
          <Chip>Attendees log themselves</Chip>
        </Stage>
      ),
    },
    {
      title: "On the day: check people in",
      label: "Event day",
      body: "Open your event page. The step by step guide unlocks when the event begins.",
      how: [
        "People tap Check in with my location when they are close enough",
        "No signal? Share the Organizer join code and they type it in",
        "You can also tap Check in or + Add attendee for someone yourself",
      ],
      visual: (
        <Stage>
          <ActionButton tone="emerald">Check in with my location</ActionButton>
          <Chip>Join code</Chip>
        </Stage>
      ),
    },
    {
      title: "Log the cleanup",
      label: "Event day",
      body: "When everyone is done, come back to your event page and enter the totals.",
      how: [
        "Open the Log step and use Log team total",
        "Optionally check in anyone still missing so they get check-in points",
        "Use Log for them to credit a single person on their own",
      ],
      visual: (
        <Stage>
          <ActionButton tone="violet">Log team total</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Share the load",
      label: "Team",
      body: "You do not have to run it alone.",
      how: [
        "On the People step, tap Make organizer to add a co-organizer",
        "Tap Remove organizer to take it back",
        "Use Email everyone who RSVP'd to send a reminder",
      ],
      visual: (
        <Stage>
          <ActionButton tone="zinc">Make organizer</ActionButton>
        </Stage>
      ),
    },
    {
      title: "See your impact",
      label: "Stats",
      body: "Open Impact stats on your group page to see what your crew has done. Anyone can view it. Admins also get the Deep Dive.",
      how: [
        "Tap Impact stats under Organizer tools, then pick a time range",
        "Tap Deep Dive (admins only) for trends, an activity map and a per-member drill-in",
        "Use Export CSV or Export Excel to take the numbers with you",
      ],
      visual: (
        <Stage>
          <Chip>Impact stats</Chip>
          <Arrow />
          <Chip on>Deep Dive</Chip>
        </Stage>
      ),
    },
  ],
};
