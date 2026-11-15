import InfoModal from "@/components/ui/InfoModal";

const ITEMS = [
  {
    dot: "bg-emerald-400",
    lead: "Neighbor jobs",
    body: "Take a job someone posted at their price. The customer's payment is held, then released to you after they confirm or 3 days after you finish.",
  },
  {
    dot: "bg-sky-400",
    lead: "Sponsored sites",
    body: "Claim a funded spot or host a cleanup in a sponsored area. Take before and after photos and you are paid from the sponsor's money once an admin approves.",
  },
  {
    dot: "bg-violet-400",
    lead: "Payouts",
    body: "Both go to your bank through Stripe. Set that up once in the payouts card.",
  },
];

/** Button that opens the two ways to get paid in a modal, so it never takes page space. */
export default function EarnGuideCard() {
  return (
    <InfoModal className="mb-4" label="Two ways to earn. Which one is for me?" title="Two ways to earn">
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
    </InfoModal>
  );
}
