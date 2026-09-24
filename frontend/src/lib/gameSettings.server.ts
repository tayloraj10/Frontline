import { createClient } from "@/lib/supabase/server";

/**
 * Server-component equivalent of the `payments_enabled` read in useGameSettings
 * (frontend/src/lib/gameSettings.tsx), which is client-only. Payment surfaces are
 * gated on `isSiteAdmin || paymentsEnabled` so admins can always see/test them,
 * while the toggle is the actual "go live" switch for everyone else.
 */
export async function getPaymentsEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("public")
    .from("game_settings")
    .select("value")
    .eq("key", "payments_enabled")
    .single();
  return data?.value === 1;
}
