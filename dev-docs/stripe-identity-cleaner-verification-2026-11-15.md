# Stripe Identity for cleaner verification

Date: 2026-11-15. Status: research notes, nothing built.

## Short answer

Yes. Stripe Identity can verify a person's government ID and a selfie match, and Frontline can store only the result (verified or not), not the images. That fits the earlier "Stripe-hosted ID capture" decision.

## What we have today

- Payouts run through Stripe Connect. Stripe's own onboarding already collects legal name, date of birth, address, tax details and, for many accounts, ID. So every paid cleaner is already identity-checked by Stripe to a degree.
- A cleaner profile is just a self-made profile (photo, rate, jobs, area) plus a signed agreement. Nothing checks that the person is who they say, and a profile can exist before payouts are set up.

## What Stripe Identity adds

- Document check (driver license, passport, ID card) with liveness and a selfie match.
- Hosted flow: we create a VerificationSession and redirect to Stripe (or use the in-app modal). Capture happens on Stripe's pages.
- Result comes back by webhook (`identity.verification_session.verified`, `requires_input`, `canceled`).
- Images stay with Stripe. We can request that Stripe return the verified name and date of birth, but we do not have to.

## Proposed flow

1. Cleaner opens the profile and taps "Verify your ID".
2. Backend creates a VerificationSession (type `document`, require matching selfie), stores `session_id` and sets status `pending`.
3. Cleaner finishes on Stripe's pages and returns to the app (same return handoff as the Stripe return work in 5.0.3).
4. Webhook sets `identity_status` to `verified` or `failed` plus `identity_verified_at`.
5. Taking a marketplace job requires `identity_status = verified`. Sponsored sites could stay open, or also require it (decision below).

## Data model

Add to `cleaner_profiles` (or a small `identity_verifications` table):

- `identity_status` text: `none`, `pending`, `verified`, `failed`
- `identity_session_id` text
- `identity_verified_at` timestamptz

No ID images, numbers or full document data stored by us.

## Cost

Stripe lists Identity at roughly $1.50 per verification (document plus selfie). Confirm current pricing in the dashboard before launch. One time per cleaner, so it is small next to job volume.

## Fit with what exists

- Connect onboarding already verifies identity for payouts. Identity is a second, stricter check on the person doing in-person work in someone's neighborhood. It matters most for neighbor jobs, where a customer lets a stranger onto their property.
- Compatible with the strike and suspension system: a suspended cleaner who tries a new profile hits the same ID, and we could block a repeat document if we keep a hash of Stripe's returned document fingerprint (open question below).
- App store review: say plainly that ID capture is done by Stripe and Frontline stores only the result.

## Open questions

1. Require it for marketplace jobs only, or for sponsored sites too?
2. Block taking jobs until verified, or allow a first job and require it before payout?
3. Do we want repeat-ID detection (needs storing something derived from the document)? That raises privacy and disclosure needs.
4. Age check: do we need 18+ gating from the verified date of birth?
5. Failure handling: how many retries, and what a cleaner sees when the check fails.
6. Does this change the cleaner agreement and privacy policy text? Yes, both should mention Stripe Identity.

## Rough effort

Backend: one route to create a session, one webhook branch, one migration. Frontend: a verify card on the cleaner profile and a gate message on job take. About a day plus testing in Stripe test mode (Stripe provides test documents).

## Recommendation

Add it for marketplace cleaners only, required before taking a first neighbor job. Keep sponsored sites on Connect onboarding alone for now.
