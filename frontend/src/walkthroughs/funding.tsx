import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const funding: WalkthroughDef = {
  id: "funding",
  title: "How earning works",
  finishLabel: "Got it",
  steps: [
    {
      title: "Where the money comes from",
      label: "Basics",
      body: "Sponsors and neighbors put up money for cleanups, and you get paid once your work is verified. You can earn three ways, all shown on the map.",
      how: [
        "Cleanup site: a sponsored spot you claim and clean on your own",
        "Group area: a sponsored region where your group hosts cleanup events",
        "Neighbor job: someone posts a job and pays one cleaner to do it",
        "Want to put money up instead? Sponsoring and hiring live on the Fund tab",
      ],
      visual: (
        <Stage>
          <Chip on>Cleanup site</Chip>
          <Chip>Group area</Chip>
          <Chip>Neighbor job</Chip>
        </Stage>
      ),
    },
    {
      title: "Open, sole credit or pool",
      label: "Types",
      body: "Sponsored places are set up in a few ways. Open sites and areas let neighbors add money, and show a + on the maps. Sole credit means one sponsor funds it alone. A pool is a crowdfunded project that becomes a funded site once the goal is met.",
      visual: (
        <Stage>
          <Chip on>Open +</Chip>
          <Chip>Sole credit</Chip>
          <Chip>Pool</Chip>
        </Stage>
      ),
    },
    {
      title: "Cleanup sites",
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
      title: "Pools and payout rules",
      label: "Pools",
      body: "A pool is the money a sponsor put in for one site or area. Each verified cleanup draws from it, and when it runs out the site or area closes.",
      how: [
        "One payout: the whole amount goes to the first approved cleaner (sites only)",
        "Fixed amount: the same pay for every verified cleanup or event",
        "Per bag: an amount for each bag collected",
        "Per attendee: group areas only, an amount per person who showed up",
        "If the money does not divide evenly, the last payout gets whatever is left",
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
      title: "Other ways to give",
      label: "Give",
      body: "Gifts do not have to be tied to a spot.",
      how: [
        "Donate: supports Frontline overall, not tied to a place",
        "Support a group: Plus groups that are open to sponsors can be gifted directly from their page",
        "Pool money with neighbors: crowdfund a bigger project from the Fund tab. Starting from a regular site neighbors can add to is best, since some money is already there. If the goal is met it becomes a funded site, and if not everyone is refunded",
      ],
      visual: (
        <Stage>
          <Chip>Donate</Chip>
          <Chip>Group</Chip>
        </Stage>
      ),
    },
    {
      title: "Plus early access",
      label: "Plus",
      body: "Frontline Plus members get a head start on newly funded sites and areas before they open to everyone.",
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
