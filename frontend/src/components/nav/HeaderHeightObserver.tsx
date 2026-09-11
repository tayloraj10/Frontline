"use client";

import { useEffect } from "react";

// AppHeader is a server component, so it can't measure its own DOM node directly.
// This mounts alongside it and measures the already-rendered <header> instead, the
// same "publish real rendered height as a CSS var" approach BottomTabBar.tsx uses
// for the bottom tab bar, so fixed modals can reserve space for both.
export default function HeaderHeightObserver() {
  useEffect(() => {
    const root = document.documentElement;
    const el = document.querySelector("header");
    if (!el) {
      root.style.setProperty("--top-header-h", "0px");
      return;
    }
    const update = () => root.style.setProperty("--top-header-h", `${el.getBoundingClientRect().height}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      root.style.setProperty("--top-header-h", "0px");
    };
  });

  return null;
}
