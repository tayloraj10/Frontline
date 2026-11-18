import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/serverUser";

export default async function ProfileRedirectPage() {
  const supabase = await createClient();
  const user = await getServerUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (!profile?.username) redirect("/login");
  redirect(`/users/${encodeURIComponent(profile.username)}`);
}
