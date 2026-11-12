import { NextRequest, NextResponse } from "next/server";
import { authHeader } from "@/lib/fastapiAuth";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

/** Thin authenticated proxy to FastAPI /api/sponsorship-pools. The backend owns every rule. */
async function forward(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const auth = await requireAdminOrPaymentsEnabled({ rewards: true });
  if (auth.error) return auth.error;
  const authz = await authHeader();
  if (!authz) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const { path = [] } = await ctx.params;
  const target = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorship-pools${path.length ? `/${path.map(encodeURIComponent).join("/")}` : ""}`;
  const init: RequestInit = { method: request.method, headers: { "Content-Type": "application/json", ...authz } };
  if (request.method === "POST") init.body = JSON.stringify(await request.json().catch(() => ({})));
  const res = await fetch(target, init);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export const GET = forward;
export const POST = forward;
