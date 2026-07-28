import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApplyGroupForm from "./ApplyGroupForm";

export default async function ApplyGroupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <ApplyGroupForm userId={user.id} />;
}
