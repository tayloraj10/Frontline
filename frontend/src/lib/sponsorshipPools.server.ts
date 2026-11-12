import { redirect } from "next/navigation";
import { authHeader } from "@/lib/fastapiAuth";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { rewardsVisible } from "@/lib/paymentsVisibility";
import type { SponsorshipPool } from "@/lib/sponsorshipPools";

/** Signed-in, rewards-visible users only; mirrors the sponsorships page gate. */
export async function requirePoolAccess() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, gate] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin, rewards_beta").eq("id", user.id).single(),
    getPaymentsGate(),
  ]);
  if (!rewardsVisible(gate, !!profile?.is_admin, !!profile?.rewards_beta)) redirect("/");
  return { user, isAdmin: !!profile?.is_admin };
}

async function poolFetch<T>(path: string): Promise<T | null> {
  const authz = await authHeader();
  if (!authz) return null;
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorship-pools${path}`, {
    headers: { ...authz },
    cache: "no-store",
  });
  return res.ok ? ((await res.json()) as T) : null;
}

export const getPool = (id: string) => poolFetch<SponsorshipPool>(`/${encodeURIComponent(id)}`);
export const listPools = () => poolFetch<{ open: SponsorshipPool[]; closed: SponsorshipPool[] }>("");
