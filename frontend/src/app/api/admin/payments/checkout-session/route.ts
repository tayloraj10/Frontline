import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrPaymentsEnabled();
  if (auth.error) return auth.error;

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "ADMIN_API_SECRET is not configured on the frontend server." }, { status: 503 });
  }

  const body = await request.json();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/payments/checkout-session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Api-Secret": secret },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
