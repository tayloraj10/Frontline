import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import ActiveJobBanner from "@/components/marketplace/ActiveJobBanner";
import MoneySupport from "@/components/ui/MoneySupport";
import { PageShell } from "@/components/ui/PageShell";
import { requireMarketplace } from "@/lib/marketplace.server";

export const metadata = { title: "Cleaner profile - Frontline" };

/** The cleaner profile lives under Earn but needs the same gate and active job banner as the Fund screens. */
export default async function CleanerProfileLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin } = await requireMarketplace();
  return (
    <PageShell width="wide">
      <ActiveJobBanner userId={user.id} isAdmin={isAdmin} />
      <Link
        href="/earn"
        className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 text-sm font-semibold text-zinc-400 touch-manipulation hover:text-zinc-100 active:scale-[0.97]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Earn
      </Link>
      {children}
      <MoneySupport />
    </PageShell>
  );
}
