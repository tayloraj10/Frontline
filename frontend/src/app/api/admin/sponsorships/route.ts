import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";
import { getSponsorBusinesses } from "@/lib/sponsorBusinesses";

async function requireSiteAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ detail: "Not authenticated" }, { status: 401 }) };

  const { data: profile } = await supabase
    .schema("public")
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return { error: NextResponse.json({ detail: "Forbidden" }, { status: 403 }) };

  return { userId: user.id as string };
}

export async function GET(request: NextRequest) {
  const auth = await requireSiteAdmin();
  if (auth.error) return auth.error;

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "ADMIN_API_SECRET is not configured on the frontend server." }, { status: 503 });
  }

  const status = request.nextUrl.searchParams.get("status");
  const url = new URL(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorships`);
  if (status) url.searchParams.set("status", status);

  const res = await fetch(url.toString(), { headers: { "X-Admin-Api-Secret": secret } });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrPaymentsEnabled();
  if (auth.error) return auth.error;

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "ADMIN_API_SECRET is not configured on the frontend server." }, { status: 503 });
  }

  const body = await request.json();
  // The sponsor is always the signed-in user, or a business they belong to. Never trust the body.
  if (body.sponsor_type === "business") {
    const supabase = await createClient();
    const mine = await getSponsorBusinesses(supabase, auth.userId);
    if (!mine.some((b) => b.id === body.sponsor_business_id)) {
      return NextResponse.json({ detail: "You can only sponsor as a business you belong to." }, { status: 403 });
    }
    body.sponsor_user_id = null;
  } else {
    body.sponsor_user_id = auth.userId;
    body.sponsor_business_id = null;
  }
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorships/checkout-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Api-Secret": secret },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
