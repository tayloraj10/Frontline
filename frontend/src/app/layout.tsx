import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Frontline",
  description: "Gamified collective action on the map",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full bg-zinc-950 text-zinc-100 flex flex-col">
        <AppHeader />
        <div className="flex flex-col flex-1 min-h-0">{children}</div>
      </body>
    </html>
  );
}
