import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for public, RLS-open reads (policies with
 * `USING (true)`). Safe to call inside `unstable_cache`/`use cache` scopes,
 * unlike the cookie-bound SSR client which can't be used there.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: process.env.NEXT_PUBLIC_DB_SCHEMA || "public" } }
  );
}
