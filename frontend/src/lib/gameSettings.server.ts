import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import type { PaymentsGate } from "@/lib/paymentsVisibility";

/**
 * Server-component read of the payments visibility settings (the useGameSettings hook is
 * client-only). Combine with `paymentsVisible(gate, isSiteAdmin)` from
 * `@/lib/paymentsVisibility` to decide whether a viewer sees payment surfaces.
 * `payments_admin_preview` defaults to on when the row is missing.
 */
export async function getPaymentsGate(): Promise<PaymentsGate> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("public")
    .from("game_settings")
    .select("key, value")
    .in("key", ["payments_enabled", "payments_admin_preview"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as number]));
  return {
    enabled: map.get("payments_enabled") === 1,
    preview: map.get("payments_admin_preview") !== 0,
  };
}

/**
 * Same result as getPaymentsGate, but shared across requests for 30s (game_settings is
 * RLS-open for reads). Use only for page rendering where a short delay in a settings
 * toggle is fine. Authorization paths (api/sponsored, paymentsAuth, ...) must keep using
 * the uncached getPaymentsGate so turning payments off takes effect immediately.
 */
export const getPaymentsGateCached = unstable_cache(
  async (): Promise<PaymentsGate> => {
    const { data, error } = await createPublicClient()
      .schema("public")
      .from("game_settings")
      .select("key, value")
      .in("key", ["payments_enabled", "payments_admin_preview"]);
    if (error) throw error; // unstable_cache does not cache thrown errors
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value as number]));
    return {
      enabled: map.get("payments_enabled") === 1,
      preview: map.get("payments_admin_preview") !== 0,
    };
  },
  ["payments-gate"],
  { revalidate: 30 }
);
