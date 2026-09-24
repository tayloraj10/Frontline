import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsEnabled } from "@/lib/gameSettings.server";
import SponsorshipsHub from "./SponsorshipsHub";

export default async function SponsorshipsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, paymentsEnabled] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single(),
    getPaymentsEnabled(),
  ]);
  if (!profile?.is_admin && !paymentsEnabled) redirect("/");

  const [{ data: geoUnits }, { data: businesses }] = await Promise.all([
    supabase
      .schema("public")
      .from("geo_units")
      .select("id, display_name, unit_id, unit_type, campaigns(title)")
      .order("display_name")
      .limit(500),
    supabase
      .schema("public")
      .from("partner_businesses")
      .select("id, name")
      .order("name"),
  ]);

  const geoUnitOptions = (geoUnits ?? []).map((g) => {
    const campaign = Array.isArray(g.campaigns) ? g.campaigns[0] : g.campaigns;
    return {
      id: g.id as string,
      label: `${g.display_name ?? g.unit_id} (${(campaign as { title: string } | null)?.title ?? g.unit_type})`,
    };
  });
  const businessOptions = (businesses ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 w-full">
      <h1 className="text-xl font-semibold text-zinc-100 mb-1">Sponsorships</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Admin-only, funding-only harness -- collects money to sponsor an area, no payout/Connect yet.
      </p>
      <SponsorshipsHub geoUnits={geoUnitOptions} businesses={businessOptions} currentUserId={user.id} />
    </main>
  );
}
