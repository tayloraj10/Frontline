import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const marketplace: WalkthroughDef = {
  id: "marketplace",
  title: "How Hire works",
  finishLabel: "Got it",
  steps: [
    {
      title: "Say what needs cleaning",
      label: "Hiring: post",
      body: "Post a job at the price you want. Cleaners near you get notified and the first one to take it gets the job.",
      how: ["Search the address, drop a pin or draw the area", "Choose the job type and when", "Set your budget"],
      visual: (
        <Stage>
          <span className="text-3xl">📝</span>
          <Arrow />
          <Chip on>Taken</Chip>
        </Stage>
      ),
    },
    {
      title: "We hold your payment",
      label: "Hiring: pay",
      body: "When a cleaner takes your job your card is charged and the money is held. Your exact address unlocks only now, and you can message the cleaner any time.",
      visual: (
        <Stage>
          <span className="text-3xl">💳</span>
          <Arrow />
          <span className="text-3xl">🔒</span>
        </Stage>
      ),
    },
    {
      title: "Confirm and release",
      label: "Hiring: confirm",
      body: "Happy with it? Confirm and rate, and the money is released. If you do nothing it releases 3 days after they finish. Not happy? Open a dispute before then.",
      visual: (
        <Stage>
          <span className="text-3xl">✅</span>
          <Arrow />
          <span className="text-3xl">⭐</span>
        </Stage>
      ),
    },
    {
      title: "Set up your cleaner profile",
      label: "Cleaning: apply",
      body: "Want to earn instead? Add your rate, the jobs you do and the area you work in, then sign the cleaner agreement. You can start taking jobs right away.",
      visual: (
        <Stage>
          <span className="text-3xl">🙂</span>
          <Arrow />
          <Chip on>Ready</Chip>
        </Stage>
      ),
    },
    {
      title: "Get alerts and take jobs",
      label: "Cleaning: take",
      body: "We notify you when a job is posted near you. Open it and take it at the posted price, or flag the price if it is too low. The exact address unlocks once you take it.",
      visual: (
        <Stage>
          <span className="text-3xl">💬</span>
          <Arrow />
          <span className="text-3xl">🧹</span>
        </Stage>
      ),
    },
    {
      title: "Get paid",
      label: "Cleaning: payout",
      body: "You are paid after the customer confirms. Frontline keeps a 15% commission and the rest goes to your bank through Stripe.",
      visual: (
        <Stage>
          <Chip on>$80</Chip>
          <Arrow />
          <span className="text-3xl">💵</span>
        </Stage>
      ),
    },
  ],
};
