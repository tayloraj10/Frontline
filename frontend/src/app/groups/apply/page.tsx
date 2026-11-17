import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/serverUser";
import ApplyGroupForm from "./ApplyGroupForm";

export default async function ApplyGroupPage() {
  const user = await getServerUser();
  if (!user) redirect("/login");

  return <ApplyGroupForm userId={user.id} />;
}
