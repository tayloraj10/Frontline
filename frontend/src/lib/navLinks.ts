export interface NavLink {
  href: string;
  label: string;
  /** Short label + emoji icon for compact chrome (bottom tab bar / overflow menu). */
  shortLabel?: string;
  icon?: string;
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
        { href: "/partners/dashboard", label: "Manage Business", shortLabel: "Business", icon: "🏪" },
        { href: "/partners", label: "Partners", shortLabel: "Partners", icon: "🤝" },
        { href: "/campaigns", label: "Explore Frontline", shortLabel: "Explore", icon: "🏁" },
        ...(isAdmin ? [{ href: "/admin", label: "Admin", shortLabel: "Admin", icon: "🛠️", highlight: true }] : []),
      ]
    : [
        { href: "/campaigns", label: "Campaigns", shortLabel: "Campaigns", icon: "🏁" },
        { href: "/leaderboard", label: "Leaderboard", shortLabel: "Leaderboard", icon: "🏆" },
        { href: "/partners", label: "Partners", shortLabel: "Partners", icon: "🤝" },
        { href: "/groups", label: "Groups", shortLabel: "Groups", icon: "👥" },
        ...(isBusinessAdmin
          ? [{ href: "/partners/dashboard", label: "Manage Business", shortLabel: "Business", icon: "🏪" }]
          : []),
        ...(isAdmin ? [{ href: "/admin", label: "Admin", shortLabel: "Admin", icon: "🛠️", highlight: true }] : []),
      ];
}

/** Primary tabs shown directly on the mobile bottom tab bar (rest overflow into "More"). */
export const PRIMARY_TAB_COUNT = 4;
