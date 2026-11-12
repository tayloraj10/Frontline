import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const marketplace: WalkthroughDef = {
  id: "marketplace",
  title: "How hiring works",
  finishLabel: "Got it",
  steps: [
    {
      title: "Say what needs cleaning",
      label: "I'm hiring",
      track: { name: "I'm hiring", tone: "sky" },
      body: "Use the Fund tab to pay people to clean or shovel snow. Post a job at the price you want. Cleaners near you get notified and the first one to take it gets the job.",
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
      label: "I'm hiring",
      track: { name: "I'm hiring", tone: "sky" },
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
      label: "I'm hiring",
      track: { name: "I'm hiring", tone: "sky" },
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
      title: "Changing your mind",
      label: "I'm hiring",
      track: { name: "I'm hiring", tone: "sky" },
      body: "You can cancel a job before it is finished. If no one has started it, you get a full refund and it comes off the board. If a cleaner never shows up, you are refunded and the job reopens.",
      visual: (
        <Stage>
          <span className="text-3xl">↩️</span>
          <Arrow />
          <Chip on>Refund</Chip>
        </Stage>
      ),
    },
    {
      title: "Set up your cleaner profile",
      label: "I'm cleaning",
      track: { name: "I'm cleaning", tone: "emerald" },
      body: "Want to earn instead? Open the Earn tab. Add a profile photo, your rate, the jobs you do and the area you work in, then sign the cleaner agreement and finish Stripe setup, which verifies your ID and tax details on Stripe's own pages.",
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
      label: "I'm cleaning",
      track: { name: "I'm cleaning", tone: "emerald" },
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
      title: "Do the job",
      label: "I'm cleaning",
      track: { name: "I'm cleaning", tone: "emerald" },
      body: "Taking a job starts a clock, so only take one you can get to. You can have one job at a time.",
      how: [
        "Get to the site within 2 hours of the start time, or the job goes back on the board",
        "Take a before photo, then start the job once you are at the site",
        "Use the mobile app: your route and time on site are recorded while the job is in progress",
        "Take an after photo showing all your bags and mark it done",
        "Backing out after the start time counts as a strike",
      ],
      visual: (
        <Stage>
          <Chip on>2 hrs</Chip>
          <Arrow />
          <span className="text-3xl">📸</span>
        </Stage>
      ),
    },
    {
      title: "Get paid",
      label: "I'm cleaning",
      track: { name: "I'm cleaning", tone: "emerald" },
      body: "You are paid the full posted price after the customer confirms. The hirer pays Frontline's service fee on top, so nothing comes out of your pay. The money goes to your bank through Stripe.",
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
