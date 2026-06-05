"use client";

import dynamic from "next/dynamic";

const NotificationBell = dynamic(() => import("./NotificationBell"), { ssr: false });

export default function NotificationBellWrapper() {
  return <NotificationBell />;
}
