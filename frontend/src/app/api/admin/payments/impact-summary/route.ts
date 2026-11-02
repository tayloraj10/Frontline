import { NextResponse } from "next/server";
import { authHeader } from "@/lib/fastapiAuth";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

export async function GET() {
  const auth = await requireAdminOrPaymentsEnabled({ rewards: true });
  if (auth.error) return auth.error;

  const authz = await authHeader();
  if (!authz) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/payments/impact-summary`, {
    headers: { ...authz },
    cache: "no-store",
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
