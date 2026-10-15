import { Stage, Chip, Arrow, PinDot, type WalkthroughDef } from "@/components/walkthrough/parts";

export const welcome: WalkthroughDef = {
  id: "welcome",
  title: "Welcome to Frontline",
  finishLabel: "Pick a campaign",
  steps: [
    {
      title: "Welcome to Frontline",
      label: "Welcome",
      body: "Frontline turns real-world action into a shared game. Join a campaign, do something good, and watch the impact show up on a live map.",
      visual: (
        <Stage>
          <span className="text-4xl">🚩</span>
          <Chip>Campaigns</Chip>
          <Chip on>Live map</Chip>
        </Stage>
      ),
    },
    {
      title: "Log what you do",
      label: "Logging",
      body: "Cleaned up a street? Snapped a photo outside? Log it in the campaign and earn points for it.",
      how: [
        "Open a campaign from this page",
        "Tap the log button on the map",
        "Add what you did and submit",
      ],
      visual: (
        <Stage>
          <PinDot tone="emerald">📍</PinDot>
          <Arrow />
          <Chip on>+ Points</Chip>
        </Stage>
      ),
    },
    {
      title: "Spend points, climb the board",
      label: "Rewards",
      body: "Points count toward the leaderboard, for you and for your group. Some local businesses also offer rewards you can claim with them.",
      how: [
        "Join a group to cleanup events and add to its total",
        "Check the leaderboard to see where you stand",
        "Look for 🎁 pins on the map to find rewards",
      ],
      visual: (
        <Stage>
          <Chip>Leaderboard</Chip>
          <Chip>Groups</Chip>
          <PinDot tone="amber">🎁</PinDot>
        </Stage>
      ),
    },
    {
      title: "Pick your first campaign",
      label: "Get started",
      body: "Each campaign is a different shared goal. Choose one below. Every campaign has its own short guide, and you can switch any time.",
      visual: (
        <Stage>
          <Chip on>Trash War</Chip>
          <Chip>Touch Grass</Chip>
          <Chip>Solarpunk</Chip>
        </Stage>
      ),
    },
  ],
};
