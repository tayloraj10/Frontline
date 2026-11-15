import { PageHeader } from "@/components/ui/PageShell";
import SponsorshipsHub from "@/app/earn/SponsorshipsHub";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";
import { createClient } from "@/lib/supabase/server";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";

/** Sponsor a cleanup: its own page, like Post a job and Start a pool. */
export default async function SponsorPage() {
  const { user, isAdmin } = await requireMarketplace();
  const supabase = await createClient();
  const [businesses, minCents] = await Promise.all([
    getSponsorBusinesses(supabase, user.id),
    mkFetch<{ min_price_cents: number }>(user.id, isAdmin, "/pricing").then((p) => p.min_price_cents).catch(() => 1500),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Sponsor"
        title="Fund a cleanup"
        subtitle="Pick where your money goes, then how it pays out. It is only paid out after the work is verified."
      />
      <SponsorshipsHub businesses={businesses} currentUserId={user.id} isAdmin={isAdmin} open="fund" minCents={minCents} />
    </>
  );
}
