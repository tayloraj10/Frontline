import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ServerUser = {
  id: string;
  email: string | null;
  // Same loose shape as supabase-js User.user_metadata (free-form provider/profile data).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_metadata: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app_metadata: Record<string, any>;
};

/**
 * The signed-in user for the current server render, or null for a logged-out visitor.
 *
 * Uses getClaims(), which verifies the session JWT locally against the cached project JWKS instead of
 * calling Supabase Auth, so a slow or degraded Auth service cannot stall page renders. It is wrapped in
 * React cache(), so the layout (header, legal gate, flair) and the page share a single lookup per request.
 *
 * Use this for read-only "who is viewing" checks in Server Components. Keep auth.getUser() for admin
 * routes and mutations, where the account should be confirmed against Supabase (revoked or deleted users).
 */
export const getServerUser = cache(async (): Promise<ServerUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    user_metadata: claims.user_metadata ?? {},
    app_metadata: claims.app_metadata ?? {},
  };
});
