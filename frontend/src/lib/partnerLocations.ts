import { createClient } from "@/lib/supabase/client";
import type { LocationPayload } from "@/components/partners/BusinessForm";

type ExistingLocation = { id: string };

// Removed locations are deactivated rather than deleted: partner_offers.location_id
// references these rows, and a hard delete would silently unscope any offer pinned
// to the location (ON DELETE SET NULL treats a null location_id as "all locations").
export async function reconcileBusinessLocations<T extends ExistingLocation>(
  supabase: ReturnType<typeof createClient>,
  businessId: string,
  currentLocations: T[],
  submittedLocations: LocationPayload[],
  selectColumns: string
): Promise<{ rows: T[]; error: null } | { rows: null; error: string }> {
  const currentIds = new Set(currentLocations.map((l) => l.id));
  const nextIds = new Set(submittedLocations.filter((l) => l.id).map((l) => l.id as string));
  const idsToDeactivate = [...currentIds].filter((id) => !nextIds.has(id));
  const locationsToUpsert = submittedLocations.map((l) => (l.id ? l : { ...l, id: crypto.randomUUID() }));

  if (idsToDeactivate.length > 0) {
    const { error: deactivateErr } = await supabase
      .schema("public")
      .from("partner_business_locations")
      .update({ status: "inactive" })
      .in("id", idsToDeactivate);
    if (deactivateErr) return { rows: null, error: `Business updated, but failed to remove some locations: ${deactivateErr.message}` };
  }

  let rows: T[] = currentLocations.filter((l) => nextIds.has(l.id));
  if (locationsToUpsert.length > 0) {
    const { data, error: upsertErr } = await supabase
      .schema("public")
      .from("partner_business_locations")
      .upsert(locationsToUpsert.map((l) => ({ ...l, business_id: businessId, status: "active" })))
      .select(selectColumns);
    if (upsertErr) return { rows: null, error: `Business updated, but failed to save some locations: ${upsertErr.message}` };
    rows = data as unknown as T[];
  }

  return { rows, error: null };
}
