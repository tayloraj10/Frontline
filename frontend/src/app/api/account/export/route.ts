import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The backend's /api/account/{user_id}/export endpoint trusts whatever id is in the
// path with no auth check of its own (same pattern as the account-delete endpoint) —
// so this route is what enforces that a caller can only ever export their own data,
// by resolving the id from the verified session rather than accepting one from the client.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/account/${user.id}/export?format=${format}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    return NextResponse.json({ detail: body?.detail ?? "Failed to export account data." }, { status: res.status });
  }

  const isCsv = format === "csv";
  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": isCsv ? "application/zip" : "application/json",
      "Content-Disposition": `attachment; filename="frontline-account-export.${isCsv ? "zip" : "json"}"`,
    },
  });
}
