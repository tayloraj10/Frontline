import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPaymentsGate } from "@/lib/gameSettings.server";
import { paymentsVisible } from "@/lib/paymentsVisibility";

/**
 * Marketplace visibility follows the rest of payments v2: the payments gate (admin preview or
 * payments_enabled) AND the marketplace_enabled game setting, which applies to admins too.
 */
export async function getMarketplaceAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false, allowed: false };

  const [{ data: profile }, gate, { data: setting }] = await Promise.all([
    supabase.schema("public").from("profiles").select("is_admin").eq("id", user.id).single(),
    getPaymentsGate(),
    supabase.schema("public").from("game_settings").select("value").eq("key", "marketplace_enabled").maybeSingle(),
  ]);
  const isAdmin = !!profile?.is_admin;
  const allowed = paymentsVisible(gate, isAdmin) && setting?.value === 1;
  return { user, isAdmin, allowed };
}

/** For server-rendered marketplace pages: redirect away unless the viewer may see the marketplace. */
export async function requireMarketplace() {
  const access = await getMarketplaceAccess();
  if (!access.user) redirect("/login");
  if (!access.allowed) redirect("/");
  return { user: access.user, isAdmin: access.isAdmin };
}

export class MarketplaceApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Server-side call to the FastAPI marketplace routes as the signed-in user. */
export async function mkFetch<T>(
  userId: string,
  isAdmin: boolean,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const secret = process.env.ADMIN_API_SECRET;
  if (!secret) throw new MarketplaceApiError("ADMIN_API_SECRET is not configured on the frontend server.", 503);
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/marketplace${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Api-Secret": secret,
      "X-Acting-User-Id": userId,
      "X-Acting-Is-Admin": isAdmin ? "1" : "0",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && typeof data.detail === "string" ? data.detail : "Something went wrong.";
    throw new MarketplaceApiError(detail, res.status);
  }
  return data as T;
}

export function marketplaceError(err: unknown) {
  if (err instanceof MarketplaceApiError) return NextResponse.json({ detail: err.message }, { status: err.status });
  return NextResponse.json({ detail: "Something went wrong." }, { status: 500 });
}
