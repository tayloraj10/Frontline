import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} dark h-full antialiased`}>
      <body className="h-full bg-zinc-950 text-zinc-100 flex flex-col">
        <NativeAppBridge />
        <AppHeader />
        <div
          id="app-scroll-container"
          className="flex flex-col flex-1 min-h-0 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0"
        >
          <PullToRefresh />
          {children}
        </div>
        <LegalGate />
      </body>
    </html>
  );
}
