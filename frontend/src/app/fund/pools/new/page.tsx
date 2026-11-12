import { PageShell, PageHeader } from "@/components/ui/PageShell";
import { requirePoolAccess } from "@/lib/sponsorshipPools.server";
import NewPoolForm from "./NewPoolForm";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function NewPoolPage() {
  await requirePoolAccess();
  const minCents = await requireMarketplace()
    .then(({ user, isAdmin }) => mkFetch<{ min_price_cents: number }>(user.id, isAdmin, "/pricing"))
    .then((p) => p.min_price_cents)
    .catch(() => 1500);
  return (
    <PageShell>
      <PageHeader
        eyebrow="Pooled sponsorship"
        title="Start a pool"
        subtitle="Pick a spot and a goal, then share the link. Neighbors add money until it is funded, and everyone is refunded if it is not."
      />
      <NewPoolForm minCents={minCents} />
    </PageShell>
  );
}
