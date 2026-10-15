import { Stage, Chip, Arrow, ActionButton, type WalkthroughDef } from "@/components/walkthrough/parts";

export const rewards: WalkthroughDef = {
  id: "rewards",
  title: "How rewards work",
  finishLabel: "Got it",
  steps: [
    {
      title: "Spend what you earn",
      label: "Earn",
      body: "Every cleanup earns points. Local businesses turn those points into real perks.",
      visual: (
        <Stage>
          <span className="text-3xl">🧹</span>
          <Arrow />
          <Chip on>Points</Chip>
          <Arrow />
          <span className="text-3xl">🎁</span>
        </Stage>
      ),
    },
    {
      title: "Pick a perk and redeem",
      label: "Redeem",
      body: "Open a business to see its offers. Each shows what it costs or what you need to unlock it.",
      how: [
        "Find an offer you have enough points for",
        "Tap Redeem",
        "No luck? The offer says how many more points you need",
      ],
      visual: (
        <Stage>
          <Chip>50 pts</Chip>
          <Arrow />
          <ActionButton tone="emerald">Redeem</ActionButton>
        </Stage>
      ),
    },
    {
      title: "Show the screen at the store",
      label: "At the store",
      body: "After you redeem you get a confirmation screen. Show it to the staff at the business.",
      how: [
        "Keep the confirmation screen open until they have seen it",
        "Staff tap Mark as used so it cannot be used twice",
        "You can find past redemptions again later",
      ],
      visual: (
        <Stage>
          <span className="inline-flex flex-col items-center px-5 py-2 rounded-xl bg-zinc-950 ring-1 ring-emerald-400/40">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Redeemed</span>
            <span className="text-lg font-mono font-bold tracking-wider text-zinc-100">COFFEE10</span>
          </span>
        </Stage>
      ),
    },
  ],
};
