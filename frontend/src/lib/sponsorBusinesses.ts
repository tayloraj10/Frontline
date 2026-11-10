import type { SupabaseClient } from "@supabase/supabase-js";

export interface SponsorBusiness {
  id: string;
  name: string;
}

/** Active partner businesses this user created or administers. Only these can be sponsored as. */
export async function getSponsorBusinesses(supabase: SupabaseClient, userId: string): Promise<SponsorBusiness[]> {
  const [{ data: admined }, { data: created }] = await Promise.all([
    supabase.schema("public").from("partner_business_admins").select("business_id").eq("user_id", userId),
    supabase.schema("public").from("partner_businesses").select("id").eq("created_by", userId),
  ]);
  const ids = [
    ...new Set([
      ...(admined ?? []).map((r) => r.business_id as string),
      ...(created ?? []).map((r) => r.id as string),
    ]),
  ];
  if (ids.length === 0) return [];
  const { data } = await supabase
    .schema("public")
    .from("partner_businesses")
    .select("id, name")
    .in("id", ids)
    .eq("status", "active")
    .order("name");
  return (data ?? []).map((b) => ({ id: b.id as string, name: b.name as string }));
}
