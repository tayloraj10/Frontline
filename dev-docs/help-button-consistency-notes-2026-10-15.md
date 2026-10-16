# Help button consistency notes (2026-10-15)

Status: NOT STARTED on its own branch. Found while testing the payments v2 Partners page. Do this on a fresh branch off master, not on `money-and-payments`.

## Problem

The "how does this work" triggers were inconsistent: some had a leading "?" glyph, labels were a mix of statements ("How it works", "Admin guide", "Welcome tour") and questions, and the link in the Partners header looked oddly placed.

## Decisions made

- Text link triggers (`FlowGuide` `variant="link"`): no leading "?" glyph. Pill style stays, right-aligned in the page or card header.
- Labels are questions ("How does X work?").
- Round icon triggers (`variant="icon"`) keep the lone "?" glyph. They are the smaller-profile option, and that is intended.
- `label` becomes a required prop on `FlowGuide`, and the generic "How this works" fallback is removed, so a help button cannot ship unlabeled.

## Changes to make

Shared components:
- `frontend/src/components/walkthrough/FlowGuide.tsx`: remove the `<span>?</span>` in the link variant; make `label` required; use `label` directly for `title`, `aria-label` and link text.
- `frontend/src/components/WelcomeTour.tsx`: remove its own copy of the "?" span; label "What is Frontline?".

Labels per usage:

| File | Style | Old label | New label |
|---|---|---|---|
| `app/partners/page.tsx` | link | How rewards work | How do rewards work? |
| `app/partners/dashboard/page.tsx` | link | How it works | How does this work? |
| `app/partners/apply/page.tsx` | link | What happens after I apply? | unchanged |
| `app/groups/[slug]/page.tsx` (Organizer tools card) | link | How it works | How does this work? |
| `app/groups/apply/ApplyGroupForm.tsx` | link | How running a group works | How does running a group work? |
| `app/admin/AdminPanel.tsx` | link | Admin guide | How does the admin panel work? |
| `app/campaigns/page.tsx` via `WelcomeTour` | link | Welcome tour | What is Frontline? |
| `components/cleanups/CleanupEventDetail.tsx` (attendee) | icon | none (fell back to "How this works") | How does this work? |
| `components/cleanups/CleanupEventDetail.tsx` (organizer) | icon | Organizer guide | How do I run this event? |
| `app/team-events/[id]/TeamEventPageClient.tsx` | icon | none | How does this work? |
| `components/map/MapChrome.tsx` (aria-label only, not a `FlowGuide`) | icon | How it works | How does the map work? |

Left alone on purpose: the "How it works" heading in `app/page.tsx` (landing page copy, not a help trigger), and walkthrough content, auto-open behavior and placement.

## Verify

- `cd frontend && npx tsc --noEmit -p .`
- Grep that every `<FlowGuide` passes a `label`.
- Eyeball each trigger at mobile width: no leading "?" on links, link pills sit sensibly in their headers.

## Note on the payments branch

These edits were briefly applied in the `money-and-payments` working tree (uncommitted). When the payments branch lands, check whether any of them survived and avoid double-applying.
