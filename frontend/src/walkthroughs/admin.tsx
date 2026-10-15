import { Stage, Chip, Arrow, ActionButton, type WalkthroughDef } from "@/components/walkthrough/parts";

export const admin: WalkthroughDef = {
  id: "admin",
  title: "Admin Panel guide",
  finishLabel: "Got it",
  steps: [
    {
      title: "Find your way around",
      label: "Navigation",
      body: "The Admin Panel is split into tabs. Each one covers a job. On a phone, extra tabs live under the More menu.",
      visual: (
        <Stage>
          <Chip on>Campaigns</Chip>
          <Chip>Events</Chip>
          <Chip>Partners</Chip>
          <Chip>Moderation</Chip>
        </Stage>
      ),
    },
    {
      title: "Campaigns",
      label: "Campaigns",
      body: "Create and manage campaigns, and see every user's points.",
      how: [
        "Fill out Create Campaign: title, slug, type, geo unit and status",
        "Keep a campaign in draft until it is ready, then set it to active",
        "Use Recompute all balances only to fix point drift. It does not re-price old entries",
      ],
      visual: (
        <Stage>
          <Chip>draft</Chip>
          <Arrow />
          <Chip on>active</Chip>
          <Chip>paused</Chip>
        </Stage>
      ),
    },
    {
      title: "Triggers",
      label: "Triggers",
      body: "Triggers make something happen automatically when a condition is met, like a notification or a boss spawn.",
      how: [
        "Pick a campaign and name the trigger",
        "Choose a condition (threshold reached, report count, time elapsed) and a value",
        "Choose the event it fires and a cooldown in hours",
        "The list shows how often each trigger fired and whether it is active",
      ],
      visual: (
        <Stage>
          <Chip>Condition</Chip>
          <Arrow />
          <Chip on>Event</Chip>
        </Stage>
      ),
    },
    {
      title: "Events",
      label: "Events",
      body: "Run timed events, bonus spots and boss spawns, and manage cleanup events and business offers.",
      how: [
        "Pick the event type, campaign, title and score multiplier",
        "Choose where it applies and when it ends",
        "Reset a cleanup event's logged data wipes its contributions, zip leader record and group log history. This cannot be undone",
      ],
      visual: (
        <Stage>
          <Chip on>timed_event</Chip>
          <Chip>bonus_spot</Chip>
          <Chip>boss_spawn</Chip>
        </Stage>
      ),
    },
    {
      title: "Partners",
      label: "Partners",
      body: "Review businesses that applied and control who can manage them.",
      how: [
        "Pending businesses were submitted for review",
        "Assign campaigns, then save to approve and publish",
        "Add business admins so a user can log in and manage that business",
        "Offers are edited from the Partner Dashboard. You can reject or delete here",
      ],
      visual: (
        <Stage>
          <Chip>Pending</Chip>
          <Arrow />
          <Chip on>Approved</Chip>
        </Stage>
      ),
    },
    {
      title: "Groups",
      label: "Groups",
      body: "Review organizations that applied to run cleanups.",
      how: [
        "Open a pending group and read the application",
        "Approving grants the applicant admin membership and publishes the group",
        "Reject or delete groups that do not belong",
        "Watch for the warning on approved groups with no admin",
      ],
      visual: (
        <Stage>
          <Chip>Pending review</Chip>
          <Arrow />
          <Chip on>Approved</Chip>
        </Stage>
      ),
    },
    {
      title: "Team events",
      label: "Team events",
      body: "Create and edit team events with a map area.",
      how: [
        "Tap New to create one, or open an existing event to edit it",
        "Draw the area on the map with the geofence picker",
        "Save to publish your changes",
      ],
      visual: (
        <Stage>
          <ActionButton tone="zinc">New team event</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Leaderboard",
      label: "Leaderboard",
      body: "See who contributed the most in any date range and check their work.",
      how: [
        "Pick a campaign and a date range, or use the this week shortcut",
        "Tap Run to load the results",
        "Open a user to verify their submissions and photos",
      ],
      visual: (
        <Stage>
          <Chip>Campaign</Chip>
          <Chip>Dates</Chip>
          <Arrow />
          <ActionButton tone="zinc">Run</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Moderation",
      label: "Moderation",
      body: "Reported photos and trash reports wait here for review.",
      how: [
        "Hide photo removes it everywhere it is shown",
        "Pull from map takes a trash report off the map",
        "Dismiss leaves it up and clears the report",
        "Tap Refresh to check for new reports. User blocks are listed below",
      ],
      visual: (
        <Stage>
          <ActionButton tone="zinc">Hide photo</ActionButton>
          <ActionButton tone="zinc">Dismiss</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Admins and Settings",
      label: "Access",
      body: "Control who has admin access and tune game values.",
      how: [
        "Admins is where you grant or remove admin roles",
        "Settings lists game values. Save each one on its own",
        "A changed setting only affects new submissions, not past ones",
      ],
      visual: (
        <Stage>
          <Chip>Admins</Chip>
          <Chip on>Settings</Chip>
        </Stage>
      ),
    },
  ],
};
