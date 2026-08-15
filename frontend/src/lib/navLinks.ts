export interface NavLink {
  href: string;
  label: string;
  /** Short label for compact chrome (bottom tab bar / overflow menu). Icon is resolved by href in BottomTabBar. */
  shortLabel?: string;
  highlight?: boolean;
}

export interface BuildNavLinksArgs {
  isBusinessOnly: boolean;
  isBusinessAdmin: boolean;
  isAdmin: boolean;
}

/** Single source of truth for the app's primary nav links, shared by the desktop nav row and the mobile bottom tab bar. */
export function buildNavLinks({ isBusinessOnly, isBusinessAdmin, isAdmin }: BuildNavLinksArgs): NavLink[] {
  return isBusinessOnly
    ? [
        { href: "/partners/dashboard", label: "Manage Business", shortLabel: "Business" },
        { href: "/partners", label: "Partners", shortLabel: "Partners" },
        { href: "/campaigns", label: "Explore Frontline", shortLabel: "Explore" },
        ...(isAdmin ? [{ href: "/admin", label: "Admin", shortLabel: "Admin", highlight: true }] : []),
      ]
    : [
        { href: "/campaigns/trash-war", label: "Campaigns", shortLabel: "Campaigns" },
        { href: "/leaderboard", label: "Leaderboard", shortLabel: "Leaderboard" },
        { href: "/partners", label: "Partners", shortLabel: "Partners" },
        { href: "/groups", label: "Groups", shortLabel: "Groups" },
        ...(isBusinessAdmin
          ? [{ href: "/partners/dashboard", label: "Manage Business", shortLabel: "Business" }]
          : []),
        ...(isAdmin ? [{ href: "/admin", label: "Admin", shortLabel: "Admin", highlight: true }] : []),
      ];
}

/** Primary tabs shown directly on the mobile bottom tab bar (rest overflow into "More"). */
export const PRIMARY_TAB_COUNT = 4;
