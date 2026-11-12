import type { Metadata } from "next";
import StripeReturnClient from "./StripeReturnClient";

export const metadata: Metadata = { title: "Returning to Frontline", robots: { index: false } };

// Only these areas can be a Stripe return target, so this page can't be used as an open redirect.
const ALLOWED_NEXT =
  /^\/(earn|fund|marketplace|sponsorships|groups)(\/[A-Za-z0-9._~%\-/]*)?(\?[A-Za-z0-9._~%&=\-]*)?$/;
const FALLBACK = "/fund";

export default async function StripeReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; app?: string | string[] }>;
}) {
  const { next, app } = await searchParams;
  const raw = Array.isArray(next) ? next[0] : next;
  const safe = raw && !raw.includes("//") && ALLOWED_NEXT.test(raw) ? raw : FALLBACK;
  return <StripeReturnClient next={safe} fromApp={app === "1"} />;
}
