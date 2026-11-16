import type { ReactNode } from "react";
import MarketplaceNav from "@/components/marketplace/MarketplaceNav";
import MoneySupport from "@/components/ui/MoneySupport";
import { PageShell } from "@/components/ui/PageShell";
import { viewMarketplace } from "@/lib/marketplace.server";

export const metadata = { title: "Fund and hire - Frontline" };

/** Everything under /fund is gated (payments gate plus marketplace_enabled). It is the Fund tab of Rewards. */
export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  await viewMarketplace();
  return (
    <PageShell width="wide">
      <MarketplaceNav />
      {children}
      <MoneySupport />
    </PageShell>
  );
}
