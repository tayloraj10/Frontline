# Sponsored site and area map popup improvements

Proposed 2026-11-11 after reading the popups in `frontend/src/components/map/useSponsoredMapLayer.ts`. Status is as of the same day.

## Done

1. **"Show in list" on site popups.** Reverse of the list-to-map focus event: a button that scrolls to that site's row (`#sponsored-row-<id>`) in `SponsoredSites`. It only renders when that row exists on the page. Shown for areas too.
3. **Show distance to the site.** When location permission is already granted, the popup says "In range (X away)." or "X away. Get closer to claim." It never triggers a permission prompt. Not done: disabling the Claim button with a reason when the user is too far. The server still rejects an out-of-range claim.
4. **Tighten the popup content.** The note, distance line and daily-limit line are one status block; "left in the pool" moved into the green stat block.
5. **Pull "Add money" out of the claim flow.** It is now an outlined secondary button next to "Show in list", not a second full-width button. (The idea was a text link; a button row tested better for tap size.)
7. **Close button size.** Now 36px with a round hit area via the `.sponsor-popup` class in `globals.css`. Not the full 44px suggested; bump it if it still feels small on a real phone.

Also done: popup narrowed to 264px so it fits the short, narrow mobile map without clipping.

## Not done

2. **Use the job pin's bottom card for sites and areas.** Jobs get a fixed card at the bottom of the map; sites and areas get a floating MapLibre popup that pans the map to fit and can sit on top of other pins. One card pattern would look consistent, stay clear of the map controls, and be easier to tap on a phone. Biggest change, since the popup code lives in the shared hook (`useSponsoredMapLayer` is also used by `CampaignMap`, `BoundaryPickerMap` and `ShapePickerMap`).
6. **Give areas a primary action.** An area popup has no button unless it is open to additions. A "Host a cleanup here" link would match the "Groups: pick this area" note. Blocked on knowing which route starts a cleanup with an area preselected.

## Not yet verified

Area popup and overlap popup (`overlapNode`) visuals, desktop width, the other consumers of the hook, and a real-phone check.
