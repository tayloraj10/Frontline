// The app scrolls inside a <main>-style container, not the window, so walk up
// from an element to its nearest scrollable ancestor and reset it (plus window).
export function scrollToTop(from?: HTMLElement | null) {
  let el: HTMLElement | null = from?.parentElement ?? null;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
      el.scrollTo({ top: 0, behavior: "smooth" });
      break;
    }
    el = el.parentElement;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
