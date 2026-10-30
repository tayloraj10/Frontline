import AddCardPrompt from "@/components/marketplace/AddCardPrompt";
import JobForm from "@/components/marketplace/JobForm";
import { PageHeader } from "@/components/ui/PageShell";
import type { CleanerCard, MeStatus } from "@/lib/marketplace";
import { mkFetch, requireMarketplace } from "@/lib/marketplace.server";

export default async function PostJobPage({ searchParams }: { searchParams: Promise<{ cleaner?: string }> }) {
  const { cleaner: cleanerId } = await searchParams;
  const { user, isAdmin } = await requireMarketplace();
  const me = await mkFetch<MeStatus>(user.id, isAdmin, "/me");
  const card = await mkFetch<{ has_card: boolean }>(user.id, isAdmin, "/payments/card").catch(() => ({ has_card: true }));
  const cleaner = cleanerId ? await mkFetch<CleanerCard>(user.id, isAdmin, `/cleaners/${cleanerId}`).catch(() => null) : null;

  return (
    <>
      <PageHeader
        eyebrow={cleaner ? "Booking request" : "Job board"}
        title={cleaner ? `Book ${cleaner.username ?? "a cleaner"}` : "Post a job"}
        subtitle={
          cleaner
            ? "Tell them what you need. Payment is held only after they accept."
            : "Describe the work and set your price. A cleaner nearby takes it, and payment is held only once one does."
        }
      />
      {!card.has_card ? (
        <AddCardPrompt returnPath={cleanerId ? `/marketplace/post?cleaner=${encodeURIComponent(cleanerId)}` : "/marketplace/post"} />
      ) : (
      <JobForm
        cleaner={cleaner ? { user_id: cleaner.user_id, username: cleaner.username, rate_type: cleaner.rate_type, rate_cents: cleaner.rate_cents } : undefined}
        services={cleaner ? cleaner.services : me.job_types}
        termsAccepted={me.customer_terms_accepted}
        flexibleMaxDays={14}
      />
      )}
    </>
  );
}
