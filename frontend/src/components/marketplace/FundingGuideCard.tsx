import GuideDisclosure from "@/components/ui/GuideDisclosure";

const ITEMS = [
  {
    dot: "bg-emerald-400",
    lead: "Hire a neighbor",
    body: "One job at your price. A neighbor does it, and your payment is held until you confirm the work.",
  },
  {
    dot: "bg-rose-400",
    lead: "Sponsor a cleanup site",
    body: "One spot, shown as a pin on the map. Any neighbor can claim it, clean it and upload before and after photos. They are paid from your money once the photos are approved.",
  },
  {
    dot: "bg-orange-400",
    lead: "Sponsor a group area",
    body: "A whole region, shown as a shaded area. Only groups earn: a group hosts a cleanup event inside the area and is paid once the event is verified. Individuals cannot claim it.",
  },
  {
    dot: "bg-sky-400",
    lead: "Let neighbors add, or keep it yours",
    body: "When you sponsor, you choose. If you let neighbors add to it, others can chip in more money (it shows a + on the map) and their names appear next to yours. If you do not, you get sole credit and nobody else can add money.",
  },
  {
    dot: "bg-violet-400",
    lead: "Crowdfund a bigger project",
    body: "Start a pool for a project that needs more than one person can give. Neighbors add money until the goal is met. If it falls short by the deadline, everyone is refunded.",
  },
];

/** Condensed, expandable counterpart for the Fund page: hire versus sponsor, site versus group area, and crowdfunds. Same look as the Earn guide. */
export default function FundingGuideCard() {
  return (
    <GuideDisclosure className="mb-4 mt-6" title="Sponsor or hire?" summary="Hire, sponsor a site or area, or crowdfund.">
      <ul className="divide-y divide-zinc-800">
        {ITEMS.map((i) => (
          <li key={i.lead} className="py-2.5 first:pt-0 last:pb-0">
            <p className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              <span className={`h-2 w-2 shrink-0 rounded-full ${i.dot}`} aria-hidden="true" />
              {i.lead}
            </p>
            <p className="mt-1 pl-4 text-[13px] leading-relaxed text-zinc-400">{i.body}</p>
          </li>
        ))}
      </ul>
    </GuideDisclosure>
  );
}
