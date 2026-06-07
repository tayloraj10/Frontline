import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateGroupForm from "./CreateGroupForm";

export default async function NewGroupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/groups");

  return <CreateGroupForm userId={user.id} />;
}
