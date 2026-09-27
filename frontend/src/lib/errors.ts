// Browsers report a fetch that failed before getting an HTTP response (dropped
// connection, app backgrounded mid-request, etc.) with cryptic wording like
// "TypeError: Load Failed" (Safari/WKWebView) or "Failed to fetch" (Chrome) --
// not something a user can act on, so swap in something they can.
export function friendlyErrorMessage(message: string): string {
  if (/load failed|failed to fetch|network\s*error/i.test(message)) {
    return "Couldn't connect. Check your internet connection and try again.";
  }
  return message;
}
