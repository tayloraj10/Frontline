import type { ReactNode } from "react";
import ActiveJobBanner from "@/components/marketplace/ActiveJobBanner";
import MarketplaceNav from "@/components/marketplace/MarketplaceNav";
import MoneySupport from "@/components/ui/MoneySupport";
import { PageShell } from "@/components/ui/PageShell";
import { requireMarketplace } from "@/lib/marketplace.server";

export const metadata = { title: "Fund and hire - Frontline" };

/** Everything under /fund is gated (payments gate plus marketplace_enabled). It is the Fund tab of Rewards. */
export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin } = await requireMarketplace();
  return (
    <PageShell width="wide">
      <ActiveJobBanner userId={user.id} isAdmin={isAdmin} />
      <MarketplaceNav />
      {children}
      <MoneySupport />
    </PageShell>
  );
}
