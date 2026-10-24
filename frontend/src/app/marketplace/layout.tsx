import type { ReactNode } from "react";
import MarketplaceNav from "@/components/marketplace/MarketplaceNav";
import { PageShell } from "@/components/ui/PageShell";
import { requireMarketplace } from "@/lib/marketplace.server";

export const metadata = { title: "Hire a cleaner - Frontline" };

/** Everything under /marketplace is gated (payments gate plus marketplace_enabled). It is the Hire tab of Rewards. */
export default async function MarketplaceLayout({ children }: { children: ReactNode }) {
  await requireMarketplace();
  return (
    <PageShell width="wide">
      <MarketplaceNav />
      {children}
    </PageShell>
  );
}
