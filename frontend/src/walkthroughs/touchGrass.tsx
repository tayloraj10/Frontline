import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const touchGrass: WalkthroughDef = {
  id: "touch-grass",
  title: "How Touch Grass works",
  finishLabel: "Got it",
  steps: [
    {
      title: "Get outside",
      label: "Overview",
      body: "It is simple: get outside and snap a photo of you enjoying nature.",
      visual: (
        <Stage>
          <span className="text-4xl">🌱</span>
          <Chip on>Outside</Chip>
          <Chip>Photo</Chip>
        </Stage>
      ),
    },
    {
      title: "Submit a photo",
      label: "Submitting",
      body: "Snap a photo of you touching grass. Anywhere on Earth counts.",
      visual: (
        <Stage>
          <span className="text-4xl">📸</span>
          <Arrow />
          <Chip on>Submitted</Chip>
        </Stage>
      ),
    },
    {
      title: "Build the collage",
      label: "Collage",
      body: "Every submission adds to the shared photo collage and your personal count.",
      visual: (
        <Stage>
          <span className="text-4xl">🖼️</span>
          <Chip>Shared collage</Chip>
          <Chip on>Your count</Chip>
        </Stage>
      ),
    },
  ],
};
