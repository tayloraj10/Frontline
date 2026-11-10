import { NextRequest, NextResponse } from "next/server";
import { authHeader } from "@/lib/fastapiAuth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const authz = await authHeader();
  if (!authz) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorships/${id}/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authz },
    body: JSON.stringify({ released_by: user.id }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
