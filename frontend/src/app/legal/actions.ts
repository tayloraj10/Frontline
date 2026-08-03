"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "@/lib/legal";

export async function acceptLegal({
  terms,
  privacy,
}: {
  terms?: boolean;
  privacy?: boolean;
}) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const update: Record<string, string> = {};
  if (terms) {
    update.terms_version_accepted = CURRENT_TERMS_VERSION;
    update.terms_accepted_at = new Date().toISOString();
  }
  if (privacy) {
    update.privacy_version_accepted = CURRENT_PRIVACY_VERSION;
    update.privacy_accepted_at = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .schema("public")
    .from("profiles")
    .update(update)
    .eq("id", user.id);
  if (error) throw new Error(error.message);
}
