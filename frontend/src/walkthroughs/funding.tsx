import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const funding: WalkthroughDef = {
  id: "funding",
  title: "How earning works",
  finishLabel: "Got it",
  steps: [
    {
      title: "Three ways to earn",
      label: "Basics",
      body: "Neighbors and sponsors put up money for cleanups, and you get paid once the work is done and verified. Everything shows on the map.",
      how: [
        "Neighbor job: someone posts a job and pays one cleaner to do it",
        "Cleanup site: a sponsored spot you claim and clean on your own",
        "Group area: a sponsored region where your group hosts cleanup events",
        "Want to pay for a cleanup instead? That is on the Fund tab",
      ],
      visual: (
        <Stage>
          <Chip on>Neighbor job</Chip>
          <Chip>Cleanup site</Chip>
          <Chip>Group area</Chip>
        </Stage>
      ),
    },
    {
      title: "Set up to get paid",
      label: "Basics",
      body: "Payouts go to your bank through Stripe, so set that up first. For neighbor jobs you also need a cleaner profile.",
      how: [
        "Payouts: finish Stripe setup, which verifies your ID and tax details on Stripe's own pages",
        "Cleaner profile (for neighbor jobs): add a photo, your rate, the jobs you do and your area, then sign the cleaner agreement",
      ],
      visual: (
        <Stage>
          <span className="text-3xl">🙂</span>
          <Arrow />
          <Chip on>Ready</Chip>
        </Stage>
      ),
    },
    {
      title: "Take a neighbor job",
      label: "Jobs",
      track: { name: "Neighbor jobs", tone: "sky" },
      body: "We notify you when a job is posted near you. Open it and take it at the posted price, or flag the price if it is too low. You see the address of the job once you take it.",
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
      label: "Jobs",
      track: { name: "Neighbor jobs", tone: "sky" },
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
      title: "Get paid for a job",
      label: "Jobs",
      track: { name: "Neighbor jobs", tone: "sky" },
      body: "You are paid the full posted price after the customer confirms. The customer pays Frontline's service fee on top, so nothing comes out of your pay.",
      visual: (
        <Stage>
          <Chip on>$80</Chip>
          <Arrow />
          <span className="text-3xl">💵</span>
        </Stage>
      ),
    },
    {
      title: "Cleanup sites",
      track: { name: "Sponsored sites", tone: "emerald" },
      label: "Sites",
      body: "A site is one specific spot a sponsor wants cleaned, shown as a pin on the map. Any signed-in cleaner can claim it.",
      how: [
        "Claim the site, then take a before photo at the pin",
        "Clean up, then take an after photo",
        "An admin reviews the photos and you get paid from the sponsor's money",
      ],
      visual: (
        <Stage>
          <span className="text-3xl">📍</span>
          <Arrow />
          <Chip on>Before + after</Chip>
          <Arrow />
          <span className="text-3xl">💵</span>
        </Stage>
      ),
    },
    {
      title: "Claiming a site",
      track: { name: "Sponsored sites", tone: "emerald" },
      label: "Claim",
      body: "Claiming holds the site for you, but the clock starts right away, so claim it when you are ready to go.",
      how: [
        "You need to be at the site to claim it",
        "You have 30 minutes after claiming to take the before photo",
        "Then you have 2 hours to clean up and take the after photo",
        "If time runs out, the site opens up for others and you get a notification. You can also let it go yourself",
        "Per-bag sites ask for your bag count with the after photo",
        "Rewards are capped per person and per day, and you need payouts set up to receive the money",
      ],
      visual: (
        <Stage>
          <Chip on>30 min</Chip>
          <Arrow />
          <Chip on>2 hrs</Chip>
        </Stage>
      ),
    },
    {
      title: "Group areas",
      track: { name: "Sponsored sites", tone: "emerald" },
      label: "Areas",
      body: "An area is a whole region, like a few neighborhoods, zip codes or a shape you draw. It is for groups hosting cleanup events.",
      how: [
        "Schedule a group cleanup event inside the area",
        "Mark the event as sponsored",
        "Once it is verified, your group earns from the area's money",
      ],
      visual: (
        <Stage>
          <span className="inline-flex h-14 w-24 items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-400/15 text-2xl">
            👥
          </span>
        </Stage>
      ),
    },
    {
      title: "How sponsored pay works",
      label: "Pay",
      track: { name: "Sponsored sites", tone: "emerald" },
      body: "Each site or area has a pool of money from its sponsor. Every verified cleanup draws from it, and when it runs out the site or area closes.",
      how: [
        "One payout: the whole amount goes to the first approved cleaner (sites only)",
        "Fixed amount: the same pay for every verified cleanup or event",
        "Per bag: an amount for each bag collected",
        "Per attendee: group areas only, an amount per person who showed up",
        "Open sites show a + because neighbors can add more money",
      ],
      visual: (
        <Stage>
          <Chip on>$150 pool</Chip>
          <Arrow />
          <Chip>$25 each</Chip>
        </Stage>
      ),
    },
    {
      title: "Plus early access",
      label: "Plus",
      body: "Frontline Plus members get a one day head start on newly funded sites and areas before they open to everyone.",
      visual: (
        <Stage>
          <Chip on>Plus</Chip>
          <Arrow />
          <span className="text-3xl">⏱️</span>
          <Arrow />
          <Chip>Everyone</Chip>
        </Stage>
      ),
    },
  ],
};
