# Payments incident runbook

For admins. Covers the alerts the platform raises and what to do about each. Written 2026-10-31.

## How alerts reach you

Admins get an in-app notification of kind `payments_admin_alert` (and `marketplace_admin_*` for Hire). Each one has a title and a Stripe reference. Details are always in the Stripe dashboard first, then in the admin panel.

| Alert title | Source |
|---|---|
| Chargeback opened: $X | Stripe webhook `charge.dispute.created` |
| Payout reversed: $X | Stripe webhook `transfer.reversed` |
| Marketplace sweep has stopped | Heartbeat check, no run for 45+ minutes |
| Hire payment problem | A Hire capture, release or refund call failed (`payment_error` on the job) |
| Hire dispute needs review | A customer or cleaner opened a dispute |

The webhook endpoint must be subscribed to `charge.dispute.created` and `transfer.reversed` in Stripe (Developers, Webhooks). Without them these two alerts never fire.

## Chargeback opened

Money may already have gone to a cleaner or recipient.

1. Open the Stripe dispute from the reference (Payments, Disputes). Note the charge, the amount and the evidence due date.
2. Find what it paid for. Search the charge or payment intent id in `marketplace_jobs.stripe_payment_intent_id` (Hire) or `sponsorships.stripe_payment_intent_id` (Earn).
3. Hold anything still unpaid:
   - Hire: if the job is not yet released, open a dispute on it so `release_after` is cleared and the sweep skips it. Do not click release.
   - Earn: do not approve further allocations on that sponsorship.
4. Submit evidence in Stripe before the due date (job photos, location checks, agreement acceptance, receipts).
5. If you lose: the platform balance is debited. If a payout already went out, Stripe may also reverse the transfer (see next section). Decide with the user whether to recover from the recipient. There is no automatic clawback.

## Payout reversed

A transfer to a connected account was pulled back (usually after a chargeback, or Stripe pulled it for the account).

1. Open the transfer in Stripe (Connect, Transfers) and read the reason.
2. Find the record: `marketplace_jobs.stripe_transfer_id` or `sponsorship_allocations.stripe_transfer_id`.
3. Do not retry the payout until the reason is understood. The retry key is fixed per job or allocation, so Stripe will return the original transfer rather than make a new one. A re-payout needs a deliberate manual transfer in Stripe.
4. Tell the recipient what happened. The record still reads paid out; correct it by hand if needed.

## Marketplace sweep has stopped

Jobs are not auto-releasing or expiring.

1. Railway, the sweep cron service, latest run log.
2. 403: `ADMIN_API_SECRET` on the cron differs from the API. 503: the API has no secret. Connection error: `API_URL` is wrong or the API is down.
3. Fix the env var, trigger the cron once, confirm a 200. The alert clears on the next successful run.
4. Nothing is lost while it is down. Jobs release on the next run.

## Hire payment problem

The job shows a `payment_error`. The customer card was declined at capture, or a release or refund call failed.

1. Open the job in the Hire admin screen and read the error.
2. Check the payment intent in Stripe.
3. Retry from the admin screen once the cause is fixed. Release and refund calls are idempotent, so retrying is safe.

## Hire dispute

1. Read both sides and the photos in the Hire admin screen (disputes list).
2. Resolve with Release (pay the cleaner) or Refund (return the customer money). Payment stays held until you do.

## Earn payout failed or waiting

An allocation with a `payout_error` is approved but not paid.

- "Recipient has not finished payout setup": they were told to add bank details. It pays on the next approval or retry after they finish.
- A Stripe error: read it on the allocation, fix it, retry the payout. Stripe dedupes on the transfer key, so a double click is safe.

## Rules of thumb

- Stripe is the source of truth for money. The database records what we asked for.
- Never refund or release from the database directly. Use the admin screens or the Stripe dashboard.
- Prefer holding to reversing. A held payout is easy to release later.
