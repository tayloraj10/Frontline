import { NextRequest, NextResponse } from "next/server";
import { getMarketplaceAccess, mkFetch, marketplaceError } from "@/lib/marketplace.server";

/**
 * Authenticated proxy for the client components. It checks the session and the marketplace
 * gate, then forwards to FastAPI with the user's token. Admin routes need is_admin.
 */
/** Reads that logged-out visitors may make (the backend hides private details from them). */
const PUBLIC_GET = /^\/(board(\/pins)?|cleaners(\/[^/]+)?|pricing|categories|jobs\/[^/]+)$/;

async function handle(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const access = await getMarketplaceAccess();
  const { path } = await ctx.params;
  const joined = `/${path.join("/")}`;
  const publicRead = request.method === "GET" && PUBLIC_GET.test(joined);
  if (!access.user && !publicRead) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  if (!access.allowed) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  if (joined.startsWith("/admin") && !access.isAdmin) {
    return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  }

  const method = request.method;
  let body: unknown;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.json().catch(() => ({}));
  }
  try {
    const data = await mkFetch(access.user?.id ?? "", access.isAdmin, `${joined}${request.nextUrl.search}`, { method, body });
    return NextResponse.json(data);
  } catch (err) {
    return marketplaceError(err);
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
