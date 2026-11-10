import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible, rewardsVisible } from "@/lib/paymentsVisibility";

/**
 * Shared auth gate for the /api/admin/payments and /api/admin/sponsorships proxy
 * routes. Pass { rewards: true } from Earn and Impact routes so beta-flagged users get in. Site admins always pass, for testing. Everyone else needs a signed-in
 * session AND the payments_enabled game_settings toggle to be on -- that toggle is
 * the actual "go live" switch (see dev-docs/payments-scoping-2026-08-20.md).
 */
export async function requireAdminOrPaymentsEnabled(opts: { rewards?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ detail: "Not authenticated" }, { status: 401 }) };

  const [{ data: profile }, paymentsGate] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin, rewards_beta").eq("id", user.id).single(),
    getPaymentsGate(),
  ]);
  const isSiteAdmin = !!profile?.is_admin;
  const visible = opts.rewards
    ? rewardsVisible(paymentsGate, isSiteAdmin, !!profile?.rewards_beta)
    : paymentsVisible(paymentsGate, isSiteAdmin);
  if (!visible) {
    return { error: NextResponse.json({ detail: "Forbidden" }, { status: 403 }) };
  }

  return { userId: user.id as string, isSiteAdmin };
}
