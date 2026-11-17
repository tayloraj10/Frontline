"use client";

import { useEffect, useRef } from "react";

// Single-line text that pans back and forth when it overflows its box, and
// stays put when it fits. Falls back to an ellipsis for reduced-motion users.
export default function MarqueeText({ text, className = "" }: { text: string; className?: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let anim: Animation | null = null;

    const update = () => {
      anim?.cancel();
      anim = null;
      inner.style.textOverflow = "";
      inner.style.display = "";
      const overflow = inner.scrollWidth - box.clientWidth;
      if (overflow <= 1) return;
      if (reduced.matches) {
        inner.style.display = "block";
        inner.style.textOverflow = "ellipsis";
        return;
      }
      // ~30px/s, with a pause at each end via the keyframe offsets.
      const duration = Math.max(3000, (overflow / 30) * 1000 + 2000);
      anim = inner.animate(
        [
          { transform: "translateX(0)", offset: 0 },
          { transform: "translateX(0)", offset: 0.2 },
          { transform: `translateX(-${overflow}px)`, offset: 0.8 },
          { transform: `translateX(-${overflow}px)`, offset: 1 },
        ],
        { duration, iterations: Infinity, direction: "alternate", easing: "linear" },
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    reduced.addEventListener("change", update);
    return () => {
      anim?.cancel();
      ro.disconnect();
      reduced.removeEventListener("change", update);
    };
  }, [text]);

  return (
    <span ref={boxRef} className={`block overflow-hidden whitespace-nowrap ${className}`}>
      <span ref={innerRef} className="inline-block min-w-full overflow-hidden">
        {text}
      </span>
    </span>
  );
}
