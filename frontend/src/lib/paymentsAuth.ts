import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsEnabled } from "@/lib/gameSettings.server";

/**
 * Shared auth gate for the /api/admin/payments and /api/admin/sponsorships proxy
 * routes. Site admins always pass, for testing. Everyone else needs a signed-in
 * session AND the payments_enabled game_settings toggle to be on -- that toggle is
 * the actual "go live" switch (see dev-docs/payments-scoping-2026-08-20.md).
 */
export async function requireAdminOrPaymentsEnabled() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ detail: "Not authenticated" }, { status: 401 }) };

  const [{ data: profile }, paymentsEnabled] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single(),
    getPaymentsEnabled(),
  ]);
  const isSiteAdmin = !!profile?.is_admin;
  if (!isSiteAdmin && !paymentsEnabled) {
    return { error: NextResponse.json({ detail: "Forbidden" }, { status: 403 }) };
  }

  return { userId: user.id as string, isSiteAdmin };
}
