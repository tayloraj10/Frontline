import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VerificationClient from "./VerificationClient";

interface Props {
  params: Promise<{ campaignId: string; userId: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}

export default async function LeaderboardVerificationPage({ params, searchParams }: Props) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  const { campaignId, userId } = await params;
  const { start, end } = await searchParams;

  const { data: subject } = await supabase
    .schema("public")
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .single();

  return (
    <VerificationClient
      campaignId={campaignId}
      userId={userId}
      start={start ?? null}
      end={end ?? null}
      displayName={subject?.display_name ?? subject?.username ?? userId}
    />
  );
}
