const EVENT = "frontline:permission-primer";
const SNOOZE_KEY = "frontline_push_primer_snoozed_until";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export type PrimerRequest = { kind: "notifications"; respond: (accepted: boolean) => void };

/** True while the user has said "Not now" recently. Blocked storage means we never snooze. */
export function isPrimerSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function snoozePrimer(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* ignore */
  }
}

/**
 * Asks the in-app primer (NotificationPrimer) whether to go ahead with the OS permission prompt.
 * Resolves true when nobody is listening, so behavior without the primer is unchanged.
 */
export function askNotificationPrimer(): Promise<boolean> {
  if (typeof window === "undefined" || isPrimerSnoozed()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const request: PrimerRequest = { kind: "notifications", respond: resolve };
    const handled = !window.dispatchEvent(new CustomEvent<PrimerRequest>(EVENT, { detail: request, cancelable: true }));
    if (!handled) resolve(true);
  });
}

export const PRIMER_EVENT = EVENT;
