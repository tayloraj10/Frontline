import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "ADMIN_API_SECRET is not configured on the frontend server." }, { status: 503 });
  }

  const body = await req.json();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/admin-prod/content-flags/resolve`,
    {
      method: "POST",
      headers: { "X-Admin-Api-Secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, admin_id: user.id }),
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
