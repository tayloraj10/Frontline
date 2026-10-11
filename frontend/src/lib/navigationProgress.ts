export const NAV_START_EVENT = "frontline:nav-start";

/**
 * Tells NavigationProgress a navigation has begun. Link clicks are picked up
 * automatically; call this before programmatic router.push()/replace() so the
 * user gets instant feedback instead of a dead tap while the server responds.
 */
export function startNavigationProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_START_EVENT));
}
