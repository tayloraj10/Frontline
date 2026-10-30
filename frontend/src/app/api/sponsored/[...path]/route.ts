import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";

/**
 * One allowlisted proxy for the sponsored-cleanup endpoints (payments v2). The caller's
 * identity always comes from the session, never the request body, then the request is
 * forwarded to FastAPI with the admin secret. Payments visibility gates every route;
 * the allocation review and payout routes additionally require a site admin.
 */

const UUID = "[0-9a-f-]{36}";
const USER_GET = [/^sites$/, /^group-areas$/, /^map$/, /^my-limits$/];
const USER_POST = [
  new RegExp(`^${UUID}/claim$`),
  new RegExp(`^${UUID}/claim/(before-photo|after-photo|release)$`),
];
const ADMIN_GET = [/^allocations$/];
const ADMIN_POST = [
  new RegExp(`^allocations/${UUID}/review$`),
  new RegExp(`^allocations/${UUID}/paid-out$`),
];

const matches = (patterns: RegExp[], path: string) => patterns.some((p) => p.test(path));

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  method: "GET" | "POST",
) {
  const path = (await params).path.join("/");
  const isAdminRoute = matches(method === "GET" ? ADMIN_GET : ADMIN_POST, path);
  const isUserRoute = matches(method === "GET" ? USER_GET : USER_POST, path);
  if (!isAdminRoute && !isUserRoute) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  const auth = await requireAdminOrPaymentsEnabled();
  if (auth.error) return auth.error;
  if (isAdminRoute && !auth.isSiteAdmin) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) {
    return NextResponse.json({ detail: "Something went wrong. Please try again in a few minutes." }, { status: 503 });
  }

  const url = new URL(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorships/${path}`);
  const init: RequestInit = { method, headers: { "X-Admin-Api-Secret": secret }, cache: "no-store" };

  if (method === "GET") {
    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== "user_id") url.searchParams.set(key, value);
    });
    if (path === "sites" || path === "my-limits") url.searchParams.set("user_id", auth.userId);
  } else {
    const body = await request.json().catch(() => ({}));
    if (path.endsWith("/review")) {
      body.reviewer_id = auth.userId;
    } else if (path.endsWith("/paid-out")) {
      body.admin_id = auth.userId;
    } else {
      body.user_id = auth.userId;
    }
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), init);
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, ctx, "GET");
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, ctx, "POST");
}
