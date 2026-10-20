export const PLUS_PRICE_LABEL = "$5/mo";

/** Shape of GET /payments/entitlement (see payments_service.get_subscription_summary). */
export interface PlusEntitlement {
  has_premium: boolean;
  since?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  is_mock?: boolean;
  early_access?: boolean;
  earning_cap_multiplier?: number;
  early_access_hours?: number;
}

/** Perk copy shown in the Plus card. Keep in sync with what is actually built. */
export function plusPerks(ownerType: "user" | "group", capMultiplier = 2, earlyHours = 48): string[] {
  if (ownerType === "group") {
    return [
      "Gold name, avatar ring and Plus badge on your group page, groups list and leaderboards",
      `Early access to new sponsored areas (${earlyHours}h head start before they open to everyone)`,
      "Higher earning cap per sponsored pool",
      "Open to sponsors: a Support button on your group page so anyone can fund you directly (turn it on in group settings)",
      "Early access to new features",
      "Coming soon: gear and rewards for your group",
    ];
  }
  return [
    "Gold name and Plus badge on your profile",
    "Shareable impact card and monthly recap",
    `${formatMultiplier(capMultiplier)} earning caps on sponsored cleanups (per-sponsor and daily)`,
    `Early access to new sponsored sites (${earlyHours}h head start before they open to everyone)`,
    "Early access to new features",
    "Coming soon: gear and rewards for members",
  ];
}

/**
 * Gate for beta features. Wrap any new experimental surface in this so Plus members see
 * it first: `if (hasEarlyAccess(entitlement)) ...`.
 */
export function hasEarlyAccess(ent: PlusEntitlement | null | undefined): boolean {
  return ent?.early_access === true;
}

function formatMultiplier(m: number): string {
  return `${Number.isInteger(m) ? m : m.toFixed(1)}x`;
}
