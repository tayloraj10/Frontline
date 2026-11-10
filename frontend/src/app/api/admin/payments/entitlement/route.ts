import { NextRequest, NextResponse } from "next/server";
import { authHeader } from "@/lib/fastapiAuth";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

export async function GET(request: NextRequest) {
  const auth = await requireAdminOrPaymentsEnabled();
  if (auth.error) return auth.error;

  const authz = await authHeader();
  if (!authz) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const ownerType = request.nextUrl.searchParams.get("owner_type");
  const ownerId = request.nextUrl.searchParams.get("owner_id");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/payments/entitlement?owner_type=${ownerType}&owner_id=${ownerId}`,
    { headers: { ...authz } },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
