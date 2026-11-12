/** True inside the Frontline mobile app's web view. Browser only (reads navigator). */
export function inNativeApp(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("FrontlineNativeApp");
}
