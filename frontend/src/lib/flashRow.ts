let current: { el: HTMLElement; outline: string; offset: string; radius: string; transition: string } | null = null;
let listening = false;

/** Remove the ring from the highlighted row, if any. */
export function clearFlash(): void {
  if (!current) return;
  const c = current;
  c.el.style.outline = c.outline;
  c.el.style.outlineOffset = c.offset;
  c.el.style.borderRadius = c.radius;
  c.el.style.transition = c.transition;
  current = null;
}

// The ring stays until the user does something that would highlight another card (clicking a
// different card or the map), instead of fading on a timer.
function onPointerDown(e: Event) {
  if (!current) return;
  const t = e.target as HTMLElement | null;
  if (!t || current.el.contains(t)) return;
  if (t.closest('[id^="job-"], [id^="sponsored-row-"], canvas, .maplibregl-popup')) clearFlash();
}

/** Scroll a list row to the middle of the screen and ring it until another card is chosen. */
export function flashRow(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  clearFlash();
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  current = { el, outline: el.style.outline, offset: el.style.outlineOffset, radius: el.style.borderRadius, transition: el.style.transition };
  el.style.outline = "3px solid #38bdf8";
  el.style.outlineOffset = "3px";
  el.style.borderRadius = el.style.borderRadius || "1rem";
  if (!listening) {
    listening = true;
    document.addEventListener("pointerdown", onPointerDown, true);
  }
}
