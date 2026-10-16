"use client";

import { useEffect } from "react";

// Marks <body> while the full-bleed map page is mounted so globals.css can float the header.
export default function MapRouteFlag() {
  useEffect(() => {
    document.body.dataset.mapFull = "";
    return () => {
      delete document.body.dataset.mapFull;
    };
  }, []);
  return null;
}
