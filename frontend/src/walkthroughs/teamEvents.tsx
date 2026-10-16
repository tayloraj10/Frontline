import { Stage, Chip, Arrow, ActionButton, PinDot, type WalkthroughDef } from "@/components/walkthrough/parts";

export const teamEvents: WalkthroughDef = {
  id: "team-events",
  title: "How team events work",
  finishLabel: "Got it",
  steps: [
    {
      title: "Teams compete to clean the most",
      label: "Overview",
      body: "A team event is a timed competition. You join a team, clean up while the event is on, and every bag counts toward your team's score.",
      visual: (
        <Stage>
          <Chip on>Team A</Chip>
          <span className="text-zinc-500 text-sm font-bold">vs</span>
          <Chip>Team B</Chip>
        </Stage>
      ),
    },
    {
      title: "Pick your team",
      label: "Joining",
      body: "Open the event and choose a team. You can switch before the event ends.",
      how: [
        "Tap Join on the team you want",
        "If your group has a team, choose Join as and pick Representing your group",
        "To switch, change your team and tap the new one",
      ],
      visual: (
        <Stage>
          <ActionButton tone="sky">Join Team A</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Your cleanups count",
      label: "Scoring",
      body: "Log cleanups as usual while the event is active. How they get attributed depends on how the event was set up.",
      how: [
        "Automatic: any cleanup you log during the event counts for your team",
        "Manual opt-in: tick the team event box when you submit",
        "Some events require a photo with every submission",
      ],
      visual: (
        <Stage>
          <Chip>Log a cleanup</Chip>
          <Arrow />
          <Chip on>Team score</Chip>
        </Stage>
      ),
    },
    {
      title: "Assigned areas",
      label: "Scoring",
      body: "Some teams are given areas to clean. If yours has one, the team card shows it.",
      how: [
        "Look for the Assigned area line on your team card",
        "Tap it to see the area on the map",
      ],
      visual: (
        <Stage>
          <PinDot tone="sky">📍</PinDot>
          <Chip on>Assigned area</Chip>
        </Stage>
      ),
    },
    {
      title: "Follow the scoreboard",
      label: "Results",
      body: "Stats shows the team scoreboard and event totals, and you can share or export the results.",
      how: [
        "Tap Stats on the event page",
        "Check the Team scoreboard",
        "Use Share and export when it is over",
      ],
      visual: (
        <Stage>
          <ActionButton tone="zinc">📊 Stats</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Contribute, win and have fun",
      label: "Wrap up",
      body: "Every bag counts. Show up, log what you pick up and cheer your team on. The team with the biggest haul wins the event, but the real win is a cleaner neighborhood.",
      how: [
        "Log every cleanup while the event is on",
        "Invite friends to join your team",
        "Check Stats to see how the race is going",
      ],
      visual: (
        <Stage>
          <span className="text-4xl">🏆</span>
          <Chip on>Winning team</Chip>
          <span className="text-4xl">🎉</span>
        </Stage>
      ),
    },
    {
      title: "Review submissions",
      label: "Reviewers",
      role: "reviewer",
      body: "If you are a reviewer for this event, you can look over the event's submissions.",
      how: [
        "Tap Review on the event page. You only see it if you are a reviewer",
        "Go through the submissions listed for the event",
      ],
      visual: (
        <Stage>
          <ActionButton tone="zinc">📋 Review</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Set up a team event",
      label: "Admins",
      role: "admin",
      body: "Site admins create team events from the Admin Panel under Team events.",
      how: [
        "Add a title, schedule, campaign and cover image",
        "Choose Automatic or Manual opt-in, and whether a photo is required",
        "Name each team, pick a color and add a logo",
        "Save, then draw each team's area on the map if you want one",
      ],
      visual: (
        <Stage>
          <Chip>Details</Chip>
          <Chip>Rules</Chip>
          <Chip on>Teams</Chip>
        </Stage>
      ),
    },
  ],
};
