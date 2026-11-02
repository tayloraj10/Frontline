# Rewards launch plan (2026-10-31)

Scope: Earn, Hire, Impact only. Perks backend lockdown waits until these three work once deployed.

Done: auth lockdown, rate limits, Hire fee on top, Earn Connect payouts, UI and mobile pass, beta flag (migration 129), CORS reviewed.

Remaining, in order:
1. [done] Stale-sweep alert: admins are notified if the marketplace sweep has not run recently.
2. [done] Chargeback and transfer-failure runbook (`dev-docs/payments-incident-runbook.md`).
3. [done] Group payout accounts: group admins add the Stripe account group money goes to; groups without one are not eligible for group allocations; approving a group allocation pays that account.
4. [done] Final pass: tests, docs, test checklist.

User-owned: apply migrations 121-135 in prod, sweep cron env (see security plan deploy note), Stripe webhook events `charge.dispute.created` and `transfer.reversed`, prod JWKS check, secret rotation, device testing.

Deferred: Perks per-redemption codes, Perks N+1 requests, Perks auth.
