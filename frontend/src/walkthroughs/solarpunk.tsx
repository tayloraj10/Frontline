import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const solarpunk: WalkthroughDef = {
  id: "solarpunk",
  title: "How Solarpunk works",
  finishLabel: "Got it",
  steps: [
    {
      title: "Grow something together",
      label: "Overview",
      body: "Log real-world regenerative actions and help the whole community grow. Every action blooms a hex on the shared map.",
      visual: (
        <Stage>
          <span className="text-4xl">☀️</span>
          <Chip>Action</Chip>
          <Arrow />
          <Chip on>Bloom</Chip>
        </Stage>
      ),
    },
    {
      title: "Log a regenerative action",
      label: "Logging",
      body: "Planted something, biked instead of drove, hosted a mutual-aid event? Pick it from the category list to earn points.",
      visual: (
        <Stage>
          <span className="text-4xl">🌻</span>
          <Chip on>Pick a category</Chip>
        </Stage>
      ),
    },
    {
      title: "Spot solarpunk in the wild",
      label: "Spotting",
      body: "See solarpunk happening around you, like a green roof or a community garden you did not build? Snap a photo of it to earn points too.",
      visual: (
        <Stage>
          <span className="text-4xl">📷</span>
          <Chip>Green roof</Chip>
          <Chip>Garden</Chip>
        </Stage>
      ),
    },
    {
      title: "Grow the World Bloom",
      label: "World Bloom",
      body: "Every action or photo adds to the cooperative World Bloom Score. Everyone is on the same side, working toward shared milestones.",
      visual: (
        <Stage>
          <span className="text-4xl">🌍</span>
          <Chip on>World Bloom Score</Chip>
        </Stage>
      ),
    },
    {
      title: "Cleanups count twice",
      label: "Cleanups",
      body: "Logging a cleanup here can also count toward Trash War, so there is no need to log it twice.",
      visual: (
        <Stage>
          <span className="text-4xl">🧹</span>
          <Arrow />
          <Chip>Solarpunk</Chip>
          <Chip>Trash War</Chip>
        </Stage>
      ),
    },
  ],
};
