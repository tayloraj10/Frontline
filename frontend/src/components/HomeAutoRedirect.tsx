"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativePlatform } from "@/lib/capacitor";
import { consumeHomeRequest } from "@/lib/homeLanding";

// Module-scoped, not sessionStorage: this needs to reset exactly when the JS
// context reloads (fresh tab, hard refresh, or a native app cold start) and
// stay set across client-side <Link> navigations within that same load.
// sessionStorage looks like the obvious fit but WKWebView (iOS) is known to
// carry sessionStorage across native app cold starts instead of clearing it
// like a browser tab would — which would silently kill this redirect after
// the app's first-ever launch. An in-memory variable has no such platform
// quirk since it can only ever survive as long as the JS module itself does.
let hasLandedThisLoad = false;

/**
 * Sends a logged-in user straight to their default destination the first time
 * they land on "/" in a given page load (fresh tab, refresh, or native app
 * cold start), but leaves them on the actual homepage if they navigate back
 * to "/" later via client-side routing (e.g. clicking the logo) — so "/"
 * stays reachable on purpose, not just as a bounce screen.
 */
export default function HomeAutoRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    // Only the native app opens straight onto the map; on the web "/" is a real page, even on refresh.
    if (!isNativePlatform()) return;
    // The logo explicitly asks for the homepage, even when it is the first "/" visit this load.
    const homeRequested = consumeHomeRequest();
    if (hasLandedThisLoad) return;
    hasLandedThisLoad = true;
    if (homeRequested) return;
    router.replace(href);
  }, [href, router]);

  return null;
}
