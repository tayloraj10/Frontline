"use client";

import dynamic from "next/dynamic";

const AchievementModal = dynamic(() => import("./AchievementModal"), { ssr: false });

export default function AchievementModalWrapper({ userId }: { userId: string }) {
  return <AchievementModal userId={userId} />;
}
