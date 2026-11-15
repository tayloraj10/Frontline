/**
 * Logged-out visitors can browse the money pages but not act. Call before an action: if there is no
 * session it sends them to log in (returning here afterwards) and resolves false.
 */
export async function ensureLoggedIn(): Promise<boolean> {
  const res = await fetch("/api/sponsored/my-limits", { cache: "no-store" }).catch(() => null);
  if (res && res.status !== 401) return true;
  if (!res) return true; // offline: let the action report its own error
  window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  return false;
}
