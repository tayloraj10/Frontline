import { NextResponse } from "next/server";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

export async function GET() {
  const auth = await requireAdminOrPaymentsEnabled();
  if (auth.error) return auth.error;

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "ADMIN_API_SECRET is not configured on the frontend server." }, { status: 503 });
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/payments/impact-summary`, {
    headers: { "X-Admin-Api-Secret": secret },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
