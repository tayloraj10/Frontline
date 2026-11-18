"use client";

import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { startNavigationProgress } from "@/lib/navigationProgress";

/**
 * Drop-in replacement for next/navigation's useRouter that shows the global
 * navigation progress indicator on push/replace, so programmatic navigations
 * give the same instant feedback as <Link> clicks.
 */
export function useRouter() {
  const router = useNextRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        startNavigationProgress();
        return router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        startNavigationProgress();
        return router.replace(...args);
      },
    }),
    [router],
  );
}
