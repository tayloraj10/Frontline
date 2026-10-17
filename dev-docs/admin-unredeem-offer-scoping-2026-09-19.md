# Admin Unredeem Offer — Scoping — 2026-09-19

**Status: scoping only, nothing built.** Motivated by having to manually run SQL against prod to undo a user's Cafe Mia redemption (deleted the `partner_redemptions` row + refunded `spendable_points`). Goal: turn that into a one-click admin action so it never requires a direct prod DB connection again.

## What "unredeem" means

Mirrors exactly what was done by hand:

1. Refund points: if `points_spent > 0`, `profiles.spendable_points += points_spent`.
2. Delete the row: `DELETE FROM partner_redemptions WHERE id = :id`.

Both in one transaction, same as `redeem_offer` in `backend/app/api/routes/partners.py` does the inverse.

## Guardrail: block if already used

**Hard block, not a soft warning** — if `used_at IS NOT NULL`, the redemption was already honored by the merchant at the register, so unredeeming it would let the user come back and get a second physical discount for free while also getting their points back. The endpoint should 409 in that case, and the UI shouldn't even render an unredeem button for used rows.

## Where it lives

The admin panel's per-offer redemptions list — `OfferRow` in `frontend/src/app/admin/AdminPanel.tsx` (~line 1742), specifically the expandable list at ~line 1875 that shows each redemption (user, redeemed_at, used_at/"Not used" badge) when you click the "N/M redeemed" link under an offer. Add an "Unredeem" button next to the "Not used" badge on each row where `used_at` is null (no button at all when it's used, per the guardrail above).

This list currently reads `partner_redemptions` directly via the Supabase client (RLS-gated, admin-only via `is_site_admin()`). The delete is more than RLS should be trusted to arbitrate atomically alongside the points refund, so this needs a real backend endpoint rather than a direct client-side delete.

## Backend

New endpoint, e.g. `POST /api/partners/redemptions/{redemption_id}/unredeem`, admin-only (same `is_site_admin()` check pattern used elsewhere in this router):

```
BEGIN
  SELECT points_spent, used_at FROM partner_redemptions WHERE id = :id FOR UPDATE
  -> 404 if not found
  -> 409 if used_at IS NOT NULL
  UPDATE profiles SET spendable_points = spendable_points + points_spent WHERE id = user_id  -- only if points_spent > 0
  DELETE FROM partner_redemptions WHERE id = :id
COMMIT
```

Returns the refunded amount so the frontend can show "Unredeemed — refunded N points."

## Frontend

- Button click -> `ConfirmModal` (same component already used for "Cancel offer?" in this file) confirming user + offer + points-to-refund before firing.
- On success: remove the row from local state (or refetch) and show the refund amount; the "N/M redeemed" count should decrement too.
- On 409 (used_at set — race condition where it got marked used between page load and click): surface the error and refresh the row instead of silently failing.

## Out of scope for v1

- Exposing this on the partner/business dashboard (only site-admin for now, per your call — businesses shouldn't be able to claw back their own honored-vs-not redemptions unilaterally without a support workflow).
- Any audit log of who unredeemed what. Worth revisiting if this gets used often enough that "why was this undone" becomes a real question — could piggyback on whatever admin-action logging pattern exists elsewhere, if any.
- Allowing unredeem on already-used redemptions even with extra confirmation — explicitly decided against for v1.
