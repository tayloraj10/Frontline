/**
 * Plain-language glossary for the Funding hub. The page uses several money terms (site, group
 * area, pool, early access); this is the one place they are defined in everyday words.
 */
const TERMS: { term: string; body: string }[] = [
  {
    term: "Cleanup site",
    body: "One specific spot a sponsor wants cleaned, like a park entrance or a vacant lot. It is a pin on the map with a small radius around it. Any signed-in cleaner can claim it, take a before photo there, clean up, then take an after photo. After an admin reviews the photos, they are paid from the sponsor's money.",
  },
  {
    term: "Group area",
    body: "A whole region a sponsor wants cleaned, like a few neighborhoods or a drawn shape. It is for groups, not solo cleaners: when a group schedules a cleanup event inside the area, it can mark the event as sponsored and the group earns from the area's money once the event is verified.",
  },
  {
    term: "Pool",
    body: "The money a sponsor put in for one site or area. Every verified cleanup draws from it, and \"left in the pool\" is what remains. When it hits zero, the site or area closes.",
  },
  {
    term: "Payout rule",
    body: "How much each cleanup earns: a flat amount per verified cleanup, an amount per bag collected, or (group areas only) an amount per attendee.",
  },
  {
    term: "Neighborhood fund and general fund",
    body: "Gifts that are not tied to one spot. A neighborhood fund supports cleanup work in one neighborhood. The general fund supports Frontline overall.",
  },
  {
    term: "Supporting a group",
    body: "A separate option. Frontline Plus groups can turn on \"Open to sponsors\", and then anyone can gift them directly from the group page. That money is paid to the group, not to a site or area.",
  },
  {
    term: "Early access",
    body: "Frontline Plus members get a head start on newly funded sites and areas before they open to everyone.",
  },
];

export default function SponsorExplainer() {
  return (
    <details className="group mb-3 rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
        What are sites, areas and pools?
        <span className="text-zinc-500 transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <dl className="space-y-3 border-t border-zinc-800 px-4 py-4">
        {TERMS.map((t) => (
          <div key={t.term}>
            <dt className="text-sm font-semibold text-emerald-300">{t.term}</dt>
            <dd className="mt-0.5 text-sm text-zinc-400">{t.body}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
