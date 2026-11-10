import type { LucideIcon } from "lucide-react";
import { Gift, CircleDollarSign, HeartHandshake, BriefcaseBusiness } from "lucide-react";
import Link from "next/link";
import { getMarketplaceAccess } from "@/lib/marketplace.server";

export type RewardsTab = "perks" | "paid" | "hire" | "impact";

const TABS: { id: RewardsTab; label: string; href: string; Icon: LucideIcon }[] = [
  { id: "perks", label: "Perks", href: "/partners", Icon: Gift },
  { id: "paid", label: "Earn", href: "/sponsorships", Icon: CircleDollarSign },
  { id: "hire", label: "Hire", href: "/marketplace", Icon: BriefcaseBusiness },
  { id: "impact", label: "Impact", href: "/impact", Icon: HeartHandshake },
];

/** Shared tab bar for the rewards area. Only rendered when payments are visible, so perks-only users never see it. The Hire tab also needs the marketplace_enabled setting. */
export default async function RewardsTabs({ current }: { current: RewardsTab }) {
  const { allowed } = await getMarketplaceAccess();
  const tabs = TABS.filter((t) => t.id !== "hire" || allowed);
  return (
    <nav aria-label="Rewards sections" className={`mb-4 grid ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-3"} border-b border-zinc-800`}>
      {tabs.map(({ Icon, ...t }) => {
        const active = t.id === current;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex min-h-14 flex-col items-center justify-center gap-0.5 border-b-2 whitespace-nowrap px-1 text-center text-[12px] font-bold touch-manipulation transition-colors active:bg-zinc-900 ${
              active ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-500 hover:text-zinc-200"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
