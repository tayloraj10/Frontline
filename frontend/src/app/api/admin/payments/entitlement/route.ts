import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminOrPaymentsEnabled();
  if (auth.error) return auth.error;

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "ADMIN_API_SECRET is not configured on the frontend server." }, { status: 503 });
  }

  const ownerType = request.nextUrl.searchParams.get("owner_type");
  const ownerId = request.nextUrl.searchParams.get("owner_id");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/payments/entitlement?owner_type=${ownerType}&owner_id=${ownerId}`,
    { headers: { "X-Admin-Api-Secret": secret } },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
