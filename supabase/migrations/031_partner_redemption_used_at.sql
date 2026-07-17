-- Tracks when a merchant actually honors a redemption at the register, separate from when the
-- user claimed it in-app (redeemed_at). Without this, a user could show the same confirmation
-- screen to more than one cashier since redeemed_at alone doesn't record it was ever honored.
-- The merchant taps "Mark as used" on the customer's phone; used_at is then set once and the
-- proof screen switches to an "already used" state on any later reopen.

ALTER TABLE partner_redemptions ADD COLUMN used_at timestamptz;
