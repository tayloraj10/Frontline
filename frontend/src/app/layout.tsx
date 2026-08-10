import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import LegalGate from "@/components/LegalGate";
import NativeAppBridge from "@/components/NativeAppBridge";
import PullToRefresh from "@/components/PullToRefresh";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Frontline",
  description: "Collective Action on the Map",
};

// Pinch-zoom is disabled only inside the native app (see capacitor.config.ts's
// appendUserAgent) — the app's own layout already handles zoom levels via
// native gestures/safe areas, so browser pinch-zoom there just breaks layout.
// Real mobile-web visitors keep normal pinch-zoom; disabling it site-wide
// would be an accessibility regression on the production website.
export async function generateViewport(): Promise<Viewport> {
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isNativeApp = userAgent.includes("FrontlineNativeApp");

  return {
    width: "device-width",
    initialScale: 1,
    ...(isNativeApp && { maximumScale: 1, userScalable: false }),
    viewportFit: "cover",
    themeColor: "#09090b",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} dark h-full antialiased`}>
      <body className="h-full bg-zinc-950 text-zinc-100 flex flex-col">
        <NativeAppBridge />
        <AppHeader />
        <div
          id="app-scroll-container"
          className="flex flex-col flex-1 min-h-0 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-0"
        >
          <PullToRefresh />
          {children}
        </div>
        <LegalGate />
      </body>
    </html>
  );
}
