import { Stage, Chip, PILL, svgProps, Arrow, ActionButton, PinDot, type WalkthroughDef } from "@/components/walkthrough/parts";

export const partner: WalkthroughDef = {
  id: "partner",
  title: "How to run your business on Frontline",
  finishLabel: "Got it",
  steps: [
    {
      title: "Reward the people who show up",
      label: "Overview",
      body: "Neighbors earn points cleaning up your community. You offer a reward, they spend points to claim it, and they walk through your door.",
      visual: (
        <Stage>
          <span className="text-4xl">🏪</span>
          <Chip>Offer</Chip>
          <Chip>Points</Chip>
          <Chip on>New customers</Chip>
        </Stage>
      ),
    },
    {
      title: "Apply and wait for review",
      label: "Applying",
      body: "Send your business in for review. A Frontline admin approves it before it shows on the map.",
      how: [
        "Fill out the List your business form",
        "Sign in when asked. Your answers are saved while you do",
        "Tap Submit for review, then set up your offers while you wait",
      ],
      visual: (
        <Stage>
          <Chip>Submitted</Chip>
          <Arrow />
          <span className="inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 ring-1 ring-amber-400/30">
            Awaiting review
          </span>
          <Arrow />
          <Chip on>Live</Chip>
        </Stage>
      ),
    },
    {
      title: "Set up your listing",
      label: "Listing",
      body: "Your dashboard is where you manage everything. Keep your info current so customers can find you.",
      how: [
        "Open your dashboard",
        "Tap Edit business info",
        "Add your logo, hours, website and pin your location on the map",
        "Tap Save changes",
      ],
      visual: (
        <Stage>
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-zinc-900 ring-2 ring-white/20 text-[10px] font-black text-zinc-300">LOGO</span>
          <ActionButton tone="zinc">Edit business info</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Create an offer",
      label: "Offers",
      body: "An offer is the reward customers unlock. Start simple, you can edit it any time.",
      how: [
        "On the Offers tab, tap + New Offer",
        "Add a title and description, like 'Free coffee with any pastry'",
        "Pick how it is redeemed (see next step)",
        "Set limits, add your code, then tap Create offer",
      ],
      visual: (
        <Stage>
          <span className={`${PILL} pl-3.5 pr-4 text-emerald-300`}>
            <svg className="w-4 h-4" {...svgProps} strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
            New Offer
          </span>
        </Stage>
      ),
    },
    {
      title: "Spend, threshold or event only",
      label: "Offers",
      body: "The redemption mode decides what a customer gives up to get your reward.",
      how: [
        "Spend: the points cost is deducted from their balance",
        "Threshold: they just need to have earned enough points, nothing is deducted",
        "Event only: the reward is for people at a cleanup event",
        "Use Max redemptions per user to stop repeat claims",
      ],
      visual: (
        <Stage>
          <Chip on>Spend</Chip>
          <Chip>Threshold</Chip>
          <Chip>Event only</Chip>
        </Stage>
      ),
    },
    {
      title: "When a customer redeems",
      label: "Redeeming",
      body: "A customer claims your offer in the app and gets a confirmation screen with a code. They show it to you at your location.",
      how: [
        "Ask to see the confirmation screen on their phone",
        "Check that the code matches the one you set",
        "Give them the reward",
        "Tap Mark as used on their screen so it cannot be used twice",
      ],
      visual: (
        <Stage>
          <span className="inline-flex flex-col items-center px-5 py-2 rounded-xl bg-zinc-950 ring-1 ring-white/10">
            <span className="text-lg font-mono font-bold tracking-wider text-zinc-100">COFFEE10</span>
            <span className="text-[10px] text-zinc-500">Tap to copy</span>
          </span>
          <Arrow />
          <ActionButton tone="zinc">Mark as used</ActionButton>
        </Stage>
      ),
    },
    {
      title: "See who redeemed",
      label: "Results",
      body: "Track how your offers are doing and who has used them.",
      how: [
        "Open the Redemptions tab to see who redeemed and when",
        "A Used date means you already honored it",
        "Radius of influence shows how far your reach goes, when available",
      ],
      visual: (
        <Stage>
          <Chip>Offers</Chip>
          <Chip on>Redemptions</Chip>
          <Chip>Radius of influence</Chip>
        </Stage>
      ),
    },
    {
      title: "How customers find you",
      label: "Discovery",
      body: "Your business appears on the Trash War map once approved, and in the Partners directory.",
      how: [
        "Look for your logo or a 🎁 pin on the map",
        "Customers tap it to see your offers and what they cost",
        "Use View on map in your dashboard to check how it looks",
      ],
      visual: (
        <Stage>
          <PinDot tone="amber">🎁</PinDot>
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-zinc-900 ring-2 ring-white/20 text-[10px] font-black text-zinc-300">LOGO</span>
        </Stage>
      ),
    },
  ],
};
