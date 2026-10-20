import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const funding: WalkthroughDef = {
  id: "funding",
  title: "How funding works",
  finishLabel: "Got it",
  steps: [
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
