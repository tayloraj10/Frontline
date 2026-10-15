/**
 * Only one walkthrough may auto-open at a time. A second one that wants to auto-open while the first is
 * still on screen simply skips (and is NOT marked seen), so it shows on the user's next visit instead of
 * stacking two dialogs back to back.
 */
let held = false;

export function claimAutoOpen(): boolean {
  if (held) return false;
  held = true;
  return true;
}

export function releaseAutoOpen(): void {
  held = false;
}

const PREFIX = "frontline_walkthrough_seen:";

export function hasSeen(id: string): boolean {
  try {
    return localStorage.getItem(PREFIX + id) === "1";
  } catch {
    // Storage blocked (private window etc): treat as seen so we never nag on every load.
    return true;
  }
}

export function markSeen(id: string): void {
  try {
    localStorage.setItem(PREFIX + id, "1");
  } catch {
    // ignore
  }
}
