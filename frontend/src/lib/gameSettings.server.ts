import { createClient } from "@/lib/supabase/server";
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
