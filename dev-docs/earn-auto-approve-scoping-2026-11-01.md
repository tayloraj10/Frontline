# Earn Auto-Approve Scoping (2026-11-01)

Status: **scoping only, not built.** At launch, traffic should be low enough that admins approve every Earn submission by hand. Build this only when the approval queue becomes a real chore.

## Today

- Every sponsored cleanup (site claim) and sponsored group event creates a `sponsor_allocations` row in `pending_review` (`sponsored_cleanups.submit_after`).
- `review_allocation(approve=True)` locks the pool, decrements `remaining_cents`, notifies the recipient, then `earn_payouts.pay_allocation` makes the Stripe transfer (idempotent). Payout after approval is already automatic.
- Checks that already run before a submission reaches the queue: GPS near the site, claim windows (30 min before photo, 2 hours after photo), per-bag count, pool balance, daily and per-pool caps with the Plus multiplier.
- The only human step is looking at the photos.

## Launch plan

Approve by hand. The daily admin email (see todo.md) lists what is waiting, so nothing sits unnoticed. Watch how many submissions arrive per day and how many get rejected. Those two numbers decide whether to build any of the below.

## Option sketch (for later)

Trusted auto-approve with a safety net:
1. **Eligibility:** submitter has at least N previously approved cleanups, no rejections in the last 30 days, payout amount at or under a threshold, all submission checks passed.
2. **Spot check:** a random share (start 20%) of eligible submissions still goes to the manual queue.
3. **Review window:** an auto-approved allocation is marked `auto_approved` and the transfer is delayed a few hours. Admins see an "auto-approved" list and can reverse any of them before money moves.
4. **Settings (in `game_settings`):** `earn_auto_approve_enabled` (default off), `earn_auto_approve_min_approved`, `earn_auto_approve_max_cents`, `earn_auto_approve_spot_check_percent`, `earn_auto_approve_delay_hours`.
5. **Groups:** sponsored events could follow the same rule per group, after the event is verified.

Suggested starting values if built: N = 3, threshold = $25, spot check 20%, delay 6 hours.

## Cheaper first steps (no auto-approve)

- Batch approve UI: a photo grid with approve and reject on each card and a select all for the page.
- Push or email to admins when something is waiting (covered by the daily admin email).
- Reject reasons as one tap presets.

## Work estimate if built

- Migration: `auto_approved` flag and `payout_after` timestamp on allocations, new settings.
- Backend: eligibility function in `sponsored_cleanups.py`, the delayed pay step in the sweep, a reverse endpoint.
- Admin UI: auto-approved list with a reverse button, settings fields.
- Tests: eligibility edge cases, reversal before and after the payout time, pool exhaustion.
- Roughly one to two days.

## Risks

- A fraudster builds trust with N real cleanups, then submits a fake one under the threshold. The spot check, the delay window and the cap on the threshold limit the loss.
- A reversed allocation must restore the pool `remaining_cents` and notify the cleaner.
- Pay delay interacts with the "paid when payout account is ready" path. Keep one code path for both.

## Decision needed before building

Threshold, N, spot check rate and delay hours.
