"use client";

import { useState, type ReactNode } from "react";
import Lightbox from "@/components/Lightbox";

/** Tap-to-enlarge for a set of photos. Call `open(i)` from a thumbnail and render `viewer` once. */
export function usePhotoViewer(urls: string[]): {
  open: (index: number) => void;
  viewer: ReactNode;
} {
  const [index, setIndex] = useState<number | null>(null);
  const viewer =
    index !== null && urls.length > 0 ? (
      <Lightbox
        images={urls}
        index={Math.min(index, urls.length - 1)}
        onClose={() => setIndex(null)}
        onNavigate={setIndex}
      />
    ) : null;
  return { open: setIndex, viewer };
}
