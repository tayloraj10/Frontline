import { createClient } from "@/lib/supabase/server";

/** Authorization header carrying the signed-in user's Supabase token. FastAPI verifies it itself. */
export async function authHeader(): Promise<{ Authorization: string } | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : null;
}
