# Mobile-First Design System — started 2026-08-04

Tracking doc for the Phase 2 paradigm shift: this app is now **mobile-first, desktop-second**.
Every new UI decision should default to "what does this look like on a phone" first, then adapt
up for wider viewports — not the reverse.

Working branch: `phase2-mobile-first` (based on `phase1-task6-geo-stats-layers` /
PR #31 — rebase onto master once that PR merges).

## Core decisions (locked in 2026-08-04)

- **Nav shell: shared component, breakpoint-driven chrome.** One `AppShell`/nav component owns
  the route list and active-state logic. It renders a **bottom tab bar on mobile** widths and
  keeps a **hamburger/top nav on desktop** widths — same underlying route data, different chrome.
  Rejected the fully-separate-components alternative: this codebase has already been burned once
  by manually-synced duplicate components drifting apart (see `CreateCleanupEventForm.tsx` /
  `ContributionPanel.tsx` modal duplication). One source of truth for nav items avoids repeating
  that mistake.
  - Rationale also considered the eventual React Native rewrite: RN shares no components with
    Next.js/Tailwind (native primitives, not DOM), so "future-proofing for RN" is a *design
    system* concern (one consistent IA/paradigm to port) rather than a code-reuse concern either
    way.
- **Admin panel is in scope.** `AdminPanel.tsx` (3,200+ lines, currently desktop-dense: 11 grid
  layouts, 5 raw `<table>`s) gets the mobile-first treatment too, not deferred.
- **Rollout: single branch, single PR at the end.** All Phase 2 mobile-first work lands on
  `phase2-mobile-first` and ships as one PR, rather than split into per-area PRs. Internally still
  worked in phased steps (see implementation plan) for sanity, just not split into separate
  reviewable PRs.

## Design principles for this pass

1. **Bottom tab bar is the primary mobile nav pattern**, replacing the current hamburger-only
   nav on small viewports. Desktop keeps a hamburger/top nav via the same shared shell.
2. **Compress "header" real estate on content pages.** E.g. the campaign map page's top panel
   (campaign name + description) is currently sized for desktop and eats too much vertical space
   on a phone map view — collapse/condense it for mobile (think: typical mobile map apps like
   Google Maps/Citizen, where the primary content — the map — dominates the viewport and info
   panels are collapsible sheets, not fixed headers).
3. **Bottom-sheet / drawer patterns over fixed side panels** for map overlays, filters, and
   contextual info on mobile — fixed side panels are a desktop pattern that doesn't translate.
4. **Touch targets ≥ 44x44px** (Apple HIG) / 48x48dp (Material) minimum for anything tappable.
5. **No hover-only affordances.** Every `onMouseEnter`/`onMouseLeave`-gated interaction needs a
   tap-to-toggle equivalent for touch.
6. **Safe-area aware.** Once Capacitor-wrapped, notch/home-indicator insets matter —
   `viewport-fit=cover` + `env(safe-area-inset-*)` padding on any edge-pinned chrome (bottom tab
   bar, floating map controls, sticky headers).
7. **Desktop is not neglected, just secondary.** Wider breakpoints should still look intentional,
   not just "mobile layout stretched wide" — but when the two pull in different directions,
   mobile wins the default and desktop gets the breakpoint override, not the other way around.

## Status

See `dev-docs/dev-plan-2026-08-03-mobile-first.md` item #8 for the overall backlog entry. This doc
is the living design-paradigm reference; update principles here as real tradeoffs come up during
implementation.
