import { redirect } from "next/navigation";
import AdminPanel, { type AdminOverview } from "@/components/marketplace/AdminPanel";
import { PageHeader } from "@/components/ui/PageShell";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function MarketplaceAdminPage() {
  const { user, isAdmin } = await requireMarketplace();
  if (!isAdmin) redirect("/marketplace");
  const overview = await mkFetch<AdminOverview>(user.id, isAdmin, "/admin/overview");
  return (
    <>
      <PageHeader eyebrow="Admin" title="Marketplace moderation" />
      <AdminPanel initial={overview} />
    </>
  );
}
