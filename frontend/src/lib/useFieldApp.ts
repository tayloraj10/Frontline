"use client";

import { useEffect, useState } from "react";
import { isNativePlatform } from "@/lib/capacitor";

/**
 * Field work (photos, start, finish) must happen in the native Frontline app so the
 * location check and route tracking are real. Taking a job or claiming a site works anywhere.
 * Outside production the gate is off so desktop testing still works.
 */
export function useFieldApp(): { blocked: boolean; isApp: boolean } {
  const [isApp, setIsApp] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Client-only platform check must run after mount to avoid a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsApp(isNativePlatform());
    setReady(true);
  }, []);
  const enforced = process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ALLOW_WEB_FIELD_WORK !== "1";
  return { isApp, blocked: ready && enforced && !isApp };
}
