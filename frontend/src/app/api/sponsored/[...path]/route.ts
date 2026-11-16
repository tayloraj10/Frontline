import { NextRequest, NextResponse } from "next/server";
import { authHeader } from "@/lib/fastapiAuth";
import { requireAdminOrPaymentsEnabled } from "@/lib/paymentsAuth";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";

/**
 * One allowlisted proxy for the sponsored-cleanup endpoints (payments v2). The caller's
 * identity always comes from the session, never the request body, then the request is
 * forwarded to FastAPI with the admin secret. Payments visibility gates every route;
 * the allocation review and payout routes additionally require a site admin.
 */

const UUID = "[0-9a-f-]{36}";
const USER_GET = [
  /^sites$/,
  /^group-areas$/,
  /^map$/,
  /^my-limits$/,
  /^claims\/mine$/,
  new RegExp(`^${UUID}/claim/result$`),
  /^payouts\/status$/,
  new RegExp(`^groups/${UUID}/payouts/status$`),
  new RegExp(`^groups/${UUID}/earning-limit$`),
];
const USER_POST = [
  /^payouts\/onboard$/,
  /^payouts\/dashboard$/,
  new RegExp(`^groups/${UUID}/payouts/(onboard|dashboard)$`),
  new RegExp(`^${UUID}/claim$`),
  new RegExp(`^${UUID}/top-up$`),
  new RegExp(`^${UUID}/claim/(before-photo|after-photo|release|extend)$`),
  new RegExp(`^${UUID}/claim/photos$`),
  new RegExp(`^${UUID}/claim/track$`),
];
const USER_DELETE = [new RegExp(`^${UUID}/claim/photos/${UUID}$`)];
const ADMIN_GET = [/^allocations$/, new RegExp(`^claims/${UUID}/track$`)];
const ADMIN_POST = [
  new RegExp(`^allocations/${UUID}/review$`),
  new RegExp(`^allocations/${UUID}/paid-out$`),
  new RegExp(`^allocations/${UUID}/pay$`),
];

/** Browse-only reads that logged-out visitors may make once payments are live for everyone. */
const PUBLIC_GET = [/^sites$/, /^group-areas$/, /^map$/];

const matches = (patterns: RegExp[], path: string) => patterns.some((p) => p.test(path));

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  method: "GET" | "POST" | "DELETE",
) {
  const path = (await params).path.join("/");
  const isAdminRoute = method === "DELETE" ? false : matches(method === "GET" ? ADMIN_GET : ADMIN_POST, path);
  const isUserRoute = matches(method === "GET" ? USER_GET : method === "DELETE" ? USER_DELETE : USER_POST, path);
  if (!isAdminRoute && !isUserRoute) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }

  if (method === "GET" && matches(PUBLIC_GET, path)) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      const gate = await getPaymentsGate();
      if (!(gate.preview && gate.enabled)) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
      const url = new URL(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorships/${path}`);
      request.nextUrl.searchParams.forEach((value, key) => {
        if (key !== "user_id") url.searchParams.set(key, value);
      });
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }
  }

  const auth = await requireAdminOrPaymentsEnabled({ rewards: true });
  if (auth.error) return auth.error;
  if (isAdminRoute && !auth.isSiteAdmin) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const authz = await authHeader();
  if (!authz) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const url = new URL(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/sponsorships/${path}`);
  const init: RequestInit = { method, headers: { ...authz }, cache: "no-store" };

  if (method === "GET") {
    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== "user_id") url.searchParams.set(key, value);
    });
    if (path === "sites" || path === "my-limits") url.searchParams.set("user_id", auth.userId);
  } else if (method === "POST") {
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

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return forward(request, ctx, "DELETE");
}
