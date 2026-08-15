"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildCampaignHrefWithSavedPosition } from "@/lib/mapPosition";

type Tab = "map" | "leaderboard" | "feed";

const TABS: { id: Tab; label: string; path: (slug: string) => string }[] = [
  { id: "map",         label: "Map",         path: (s) => `/campaigns/${s}` },
  { id: "leaderboard", label: "Leaderboard", path: (s) => `/campaigns/${s}/leaderboard` },
  { id: "feed",        label: "Activity",    path: (s) => `/campaigns/${s}/feed` },
];

export default function CampaignTabNav({ slug, active }: { slug: string; active: Tab }) {
  const router = useRouter();

  function handleMapClick(e: React.MouseEvent) {
    e.preventDefault();
    router.push(buildCampaignHrefWithSavedPosition(slug));
  }

  return (
    <div className="flex items-center gap-0.5">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.path(slug)}
          onClick={tab.id === "map" ? handleMapClick : undefined}
          className={`px-3 py-1 text-xs font-medium rounded-lg transition-[background-color,color,transform] duration-150 active:scale-[0.95] touch-manipulation ${
            active === tab.id
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 active:text-zinc-300 active:bg-zinc-800/60"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
