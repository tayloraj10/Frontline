import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible } from "@/lib/paymentsVisibility";
import { PlusFlairContextProvider } from "./PlusFlair";

/** Resolves once per request whether the viewer may see payment flair, then shares it with client lists. */
export default async function PlusFlairProvider({ children }: { children: React.ReactNode }) {
  let visible = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [gate, adminRow] = await Promise.all([
      getPaymentsGate(),
      user ? supabase.from("profiles").select("is_admin").eq("id", user.id).single() : Promise.resolve({ data: null }),
    ]);
    visible = paymentsVisible(gate, !!(adminRow.data as { is_admin?: boolean } | null)?.is_admin);
  } catch {
    visible = false;
  }
  return <PlusFlairContextProvider visible={visible}>{children}</PlusFlairContextProvider>;
}
