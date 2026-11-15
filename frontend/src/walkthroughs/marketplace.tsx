import { Stage, Chip, Arrow, type WalkthroughDef } from "@/components/walkthrough/parts";

export const marketplace: WalkthroughDef = {
  id: "marketplace",
  title: "How funding works",
  finishLabel: "Got it",
  steps: [
    {
      title: "Three ways to put money in",
      label: "Basics",
      body: "The Fund tab is where you pay for cleanups. Pick the one that fits. Taking jobs and claiming sites to get paid is on the Earn tab.",
      how: [
        "Post a job: pay one neighbor to clean or shovel snow for you",
        "Sponsor a cleanup: fund a spot or an area, and any cleaner or group can earn it",
        "Crowdfund: pool money with neighbors for a bigger project",
      ],
      visual: (
        <Stage>
          <Chip on>Post a job</Chip>
          <Chip>Sponsor</Chip>
          <Chip>Crowdfund</Chip>
        </Stage>
      ),
    },
    {
      title: "Post a job",
      label: "Post a job",
      track: { name: "Hire a neighbor", tone: "sky" },
      body: "Say what needs cleaning and set your price. Cleaners near you get notified and the first one to take it gets the job.",
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
      label: "Post a job",
      track: { name: "Hire a neighbor", tone: "sky" },
      body: "When a cleaner takes your job your card is charged and the money is held. The cleaner can now see the address of the job, and you can message them any time.",
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
      label: "Post a job",
      track: { name: "Hire a neighbor", tone: "sky" },
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
      label: "Post a job",
      track: { name: "Hire a neighbor", tone: "sky" },
      body: "You can cancel any time before the cleaner starts the work, and you get a full refund. Once the work has started you cannot cancel, so open a dispute if something went wrong. If a cleaner who accepted your job backs out, you are refunded and the job goes back on the board.",
      visual: (
        <Stage>
          <span className="text-3xl">↩️</span>
          <Arrow />
          <Chip on>Refund</Chip>
        </Stage>
      ),
    },
    {
      title: "Sponsor a spot or an area",
      label: "Sponsor",
      track: { name: "Sponsor a cleanup", tone: "emerald" },
      body: "Put money behind cleanups at a place. It is only paid out after the work is verified.",
      how: [
        "Cleanup site: one spot, shown as a pin. Any neighbor can claim it and get paid",
        "Group area: a whole region. Groups host cleanup events there and get paid",
        "Choose how it pays: one payout, a fixed amount, per bag, or per attendee",
        "When the money runs out, the site or area closes",
      ],
      visual: (
        <Stage>
          <span className="text-3xl">📍</span>
          <Chip on>$150</Chip>
          <Arrow />
          <span className="text-3xl">🧹</span>
        </Stage>
      ),
    },
    {
      title: "Let neighbors add money",
      label: "Sponsor",
      track: { name: "Sponsor a cleanup", tone: "emerald" },
      body: "Leave \"Let neighbors add to this\" on and others can top it up, shown as a + on the maps. Turn it off to keep sole credit.",
      visual: (
        <Stage>
          <Chip on>Open +</Chip>
          <Chip>Sole credit</Chip>
        </Stage>
      ),
    },
    {
      title: "Crowdfund a big project",
      label: "Crowdfund",
      body: "Start a pool with a goal and share the link. Neighbors add money until it is funded, and then it becomes a funded site. If the goal is missed or you cancel, everyone is refunded. Starting from a regular site that others can add to is easier, since some money is already there.",
      visual: (
        <Stage>
          <Chip on>$400 goal</Chip>
          <Arrow />
          <Chip>Funded</Chip>
        </Stage>
      ),
    },
    {
      title: "Other ways to give",
      label: "Give",
      body: "Gifts do not have to be tied to a spot.",
      how: [
        "Donate: supports Frontline overall",
        "Support a group: some groups accept gifts. If a group allows it, you will see a give button on its page",
      ],
      visual: (
        <Stage>
          <Chip>Donate</Chip>
          <Chip>Group</Chip>
        </Stage>
      ),
    },
  ],
};
