import type { SupabaseClient } from "@supabase/supabase-js";

// Apple only ever sends the user's real name once, in the native SDK's login
// response (profile.givenName/familyName) -- never in the ID token itself, so
// the handle_new_user() DB trigger that seeds profiles.username/display_name
// on first insert can't see it for native sign-ins. Backfill here right after
// signInWithIdToken succeeds, while we still have it.
export async function applyAppleProfileName(
  supabase: SupabaseClient,
  userId: string,
  profile: { givenName?: string | null; familyName?: string | null } | undefined
) {
  const fullName = [profile?.givenName, profile?.familyName].filter(Boolean).join(" ").trim();
  const base = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!base) return;

  let candidate = base;
  let suffix = 0;
  for (let attempt = 0; attempt < 20; attempt++) {
    const { data: existing } = await supabase.from("profiles").select("id").eq("username", candidate).maybeSingle();
    if (!existing || existing.id === userId) break;
    suffix += 1;
    candidate = `${base}${suffix}`;
  }

  await supabase.from("profiles").update({ display_name: fullName, username: candidate }).eq("id", userId);
}
