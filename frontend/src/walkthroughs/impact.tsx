import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const impact: WalkthroughDef = {
  id: "impact",
  title: "How Impact works",
  finishLabel: "Got it",
  steps: [
    {
      title: "See what your money did",
      label: "Recap",
      body: "Your monthly recap shows the cleanups you funded, the bags collected and the people paid.",
      visual: (
        <Stage>
          <span className="text-3xl">💚</span>
          <Arrow />
          <Chip on>Monthly recap</Chip>
        </Stage>
      ),
    },
    {
      title: "Plus keeps it going",
      label: "Plus",
      body: "Plus is a monthly plan. Half of every dollar pays cleaners, and you earn double points.",
      visual: (
        <Stage>
          <Chip on>Plus</Chip>
          <Arrow />
          <span className="text-3xl">⚡</span>
        </Stage>
      ),
    },
    {
      title: "Sponsor a group, keep receipts",
      label: "Give",
      body: "Fund your crew or your block, and find receipts for everything in one place.",
      visual: (
        <Stage>
          <span className="text-3xl">👥</span>
          <Arrow />
          <span className="text-3xl">🧾</span>
        </Stage>
      ),
    },
  ],
};
