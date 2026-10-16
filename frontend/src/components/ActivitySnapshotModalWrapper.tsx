"use client";

import dynamic from "next/dynamic";

const ActivitySnapshotModal = dynamic(() => import("./admin/ActivitySnapshotModal"), { ssr: false });

export default function ActivitySnapshotModalWrapper({ hasPendingReviewItems }: { hasPendingReviewItems: boolean }) {
  return <ActivitySnapshotModal hasPendingReviewItems={hasPendingReviewItems} />;
}
