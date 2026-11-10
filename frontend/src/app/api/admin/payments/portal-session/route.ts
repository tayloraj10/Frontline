import { NextRequest, NextResponse } from "next/server";
import { authHeader } from "@/lib/fastapiAuth";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrPaymentsEnabled();
  if (auth.error) return auth.error;

  const authz = await authHeader();
  if (!authz) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const body = await request.json();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/payments/portal-session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authz },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
