import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, PageShell } from "@/components/ui/PageShell";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";
import SponsorshipsHub from "../SponsorshipsHub";
import SponsoredMap from "../SponsoredMap";

export default async function SponsorshipAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/earn");
  const businesses = await getSponsorBusinesses(supabase, user.id);
  return (
    <PageShell width="wide">
      <Link
        href="/earn"
        className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 text-sm font-semibold text-zinc-400 touch-manipulation hover:text-zinc-100 active:scale-[0.97]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Earn
      </Link>
      <PageHeader eyebrow="Admin" title="Sponsorship admin" />
      <SponsoredMap compact />
      <SponsorshipsHub businesses={businesses} currentUserId={user.id} isAdmin open="admin" />
    </PageShell>
  );
}
