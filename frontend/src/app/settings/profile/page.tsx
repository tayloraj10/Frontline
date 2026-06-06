import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileEditForm from "./ProfileEditForm";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <div className="mb-8">
        <h1 className="text-xl font-black text-zinc-100">Edit profile</h1>
        <p className="mt-1 text-sm text-zinc-500">@{profile.username}</p>
      </div>

      <div className="border border-zinc-800 rounded-xl p-6 bg-zinc-900/30">
        <ProfileEditForm
          userId={profile.id}
          username={profile.username}
          displayName={profile.display_name}
          bio={profile.bio}
        />
      </div>
    </main>
  );
}
