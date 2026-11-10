"use client";

import { createContext, useContext } from "react";
import PlusBadge from "./PlusBadge";

const PlusFlairContext = createContext(false);

/** Client side of the Plus flair switch. The server provider decides visibility once per request. */
export function PlusFlairContextProvider({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return <PlusFlairContext.Provider value={visible}>{children}</PlusFlairContext.Provider>;
}

/**
 * Small Plus pill next to a member's name in lists (leaderboards, attendees). Renders nothing
 * unless the member is Plus AND payment UI is visible to the viewer, so it stays hidden while
 * payments are admin-only.
 */
export default function PlusFlair({ isPlus, className = "ml-1.5" }: { isPlus?: boolean; className?: string }) {
  const visible = useContext(PlusFlairContext);
  if (!isPlus || !visible) return null;
  return <PlusBadge className={className} />;
}
