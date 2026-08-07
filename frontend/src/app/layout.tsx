import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import LegalGate from "@/components/LegalGate";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Frontline",
  description: "Collective Action on the Map",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} dark h-full antialiased`}>
      <body className="h-full bg-zinc-950 text-zinc-100 flex flex-col">
        <AppHeader />
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto pb-16 sm:pb-0">{children}</div>
        <LegalGate />
      </body>
    </html>
  );
}
