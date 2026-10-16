import type { PlusEntitlement } from "@/lib/plus";

/**
 * Server-component lookup of an owner's Plus status, so pages can render flair without a
 * client round trip. Returns a non-Plus result on any failure: flair is never critical.
 * Callers must already have checked `paymentsVisible` for the viewer.
 */
export async function getPlusEntitlement(ownerType: "user" | "group", ownerId: string): Promise<PlusEntitlement> {
  const secret = process.env.ADMIN_API_SECRET;
  const base = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!secret || !base) return { has_premium: false };
  try {
    const res = await fetch(`${base}/api/payments/entitlement?owner_type=${ownerType}&owner_id=${ownerId}`, {
      headers: { "X-Admin-Api-Secret": secret },
      cache: "no-store",
    });
    if (!res.ok) return { has_premium: false };
    return (await res.json()) as PlusEntitlement;
  } catch {
    return { has_premium: false };
  }
}

/** Ids of all Plus groups, for list-page flair. Empty on any failure. */
export async function getPlusGroupIds(): Promise<string[]> {
  const secret = process.env.ADMIN_API_SECRET;
  const base = process.env.NEXT_PUBLIC_FASTAPI_URL;
  if (!secret || !base) return [];
  try {
    const res = await fetch(`${base}/api/payments/plus-groups`, { headers: { "X-Admin-Api-Secret": secret }, cache: "no-store" });
    if (!res.ok) return [];
    return ((await res.json()) as { group_ids: string[] }).group_ids;
  } catch {
    return [];
  }
}
