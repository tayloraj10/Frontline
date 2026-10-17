# Shared Points/Ledger API — Scoping — 2026-08-13

**Status: scoping only, nothing built.** This is a new standalone service, not a Frontline feature — separate repo, separate DB, separate hosting. Frontline would be its first consumer/partner app.

## The idea

A points balance + ledger as a small, dedicated service that other social-good apps (starting with Frontline) can plug into, so a user's "points earned doing good" become portable across participating apps and redeemable at partner businesses regardless of which app they earned them in. Motivated by wanting a shared ecosystem rather than every app reinventing its own siloed rewards system.

Explicitly out of scope for this service: campaign logic, contribution verification, business/offer management, anti-gaming — all of that stays in each partner app (Frontline included). The shared service only knows "this account has this many points" and "here's the transaction history," nothing about *why*.

## Core design: two tables, event-sourced ledger

- **`accounts`** — `(account_id PK, app_id, external_user_id, total_points, spendable_points, created_at)`, unique on `(app_id, external_user_id)`. `external_user_id` is whatever opaque ID the partner app uses internally (e.g. Frontline's `users.id`) — not an email, not a name, not anything else identifying.
- **`ledger`** — `(id PK, account_id FK, delta, type, reference, balance_after, created_at)` — append-only. `total_points`/`spendable_points` on `accounts` are materialized/derived from the ledger, not independently mutable, so the ledger stays the source of truth (same pattern as a bank ledger — matches how Frontline's own contribution tables work: raw events + derived aggregates, not directly-editable counters).

No PII stored anywhere in this service. Partner apps authenticate as themselves (per-`app_id` API key/secret) and can only read/write accounts under their own `app_id`.

## The identity-linking problem

Two accounts in two different apps belonging to the same real person are, by default, two unrelated rows — the service has no way to know they're the same human, by design (no PII to match on). Two ways to handle this:

1. **No linking (v1).** Points stay siloed per-app. Simplest, ships fastest, zero privacy exposure. A user's Frontline points and their AppB points just don't talk to each other yet.
2. **Opt-in linking via a small consolidated frontend (your call, and the direction to build toward).** A lightweight web app that sits in front of the shared service, where a user logs into it and explicitly links their per-app accounts together — proving ownership of each rather than the service inferring identity from any shared data point. Concretely:
   - The linking frontend gets its own **user identity** (email/OAuth login) — this is the *only* place in the whole system that ever holds a person's real identity, and it's intentionally decoupled from the points/ledger service itself. It stores a mapping table (`link_user_id -> [(app_id, account_id)]`) and nothing else points-related.
   - To link an account, the user goes through a per-app OAuth-style consent flow (redirect to Frontline while logged into Frontline, approve the link, redirect back with a short-lived proof token) — the same shape as "Sign in with Google" or Plaid Link, just linking accounts instead of authenticating. This means the *partner app* vouches for "yes, this account belongs to the person currently authenticated," the shared service never has to.
   - Once linked, the shared service can expose an aggregate view (e.g. `GET /users/{link_user_id}/balance` returns points summed across all linked `(app_id, account_id)` pairs) without ever learning who the person is — the linking frontend is the only thing that knows the mapping, and it can be queried by `link_user_id` (itself just an opaque ID, no PII required to create one beyond whatever the linking frontend's own login needs).
   - This keeps the core points/ledger service's "no PII" property intact even with linking — the privacy-sensitive part (the identity graph) lives in one clearly-scoped place, not smeared across the ledger service.
3. Explicitly **not** doing: inferring links via hashed PII (email/phone hashes) — low-entropy hashes of common identifiers are crackable via reverse lookup / rainbow tables, so this would be pseudonymous at best while looking anonymous, which is worse than being honest that linking requires an opt-in step.

Recommended order: build v1 (no linking, siloed per-app accounts) first so the core ledger/balance mechanics exist and Frontline can integrate against something real, then build the linking frontend as a distinct second service once there's a second partner app to actually link to (linking one app to itself is meaningless).

## Regulatory flag — check before going further than a prototype

Once points earned in one app are redeemable as real discounts at businesses via a different app, this starts to resemble a stored-value/gift-card system, which can trigger money-transmitter licensing or unclaimed-property law depending on jurisdiction and whether points are ever purchasable/refundable/transferable for cash-equivalent value. Worth a real legal gut-check once this moves past "points redeemable within Frontline's own partner network" (which is what exists today) toward "points redeemable across independently-owned apps' business networks." Not a blocker for scoping/prototyping, but a blocker for launch.

## Prior art

- **Airline alliance miles / points.com** — proves the "points portable across brands" model works commercially, but runs on bilateral legal partnerships between the brands, not an open API anyone can integrate with. Relevant precedent for "this is a solvable problem," not a technical template.
- **Blockchain-based loyalty tokens** (Loyyal and similar ERC-20-based reward-token projects) — mostly failed to get adoption. Businesses don't want token price volatility or wallet-management complexity, and a fungible cross-org token is exactly the thing that invites the money-transmitter question above. Worth knowing about mainly as a cautionary example, not a direction to imitate — a plain database ledger with an API is a better fit here than anything on-chain.
- **Open Loyalty** (open-source multi-brand loyalty platform) and commercial players like Cardlytics — closer in spirit (centralized ledger, multiple participating merchants) but built as paid SaaS for businesses to buy into, not a free/open API for other apps to integrate with directly. Useful as a reference for table/API shape, not a service to depend on.

## Hosting (cheap path)

- **API**: FastAPI on Fly.io or Railway hobby tier — cheapest reasonable option for a small always-on-ish service; both have generous free/low-cost tiers for low traffic.
- **DB**: a dedicated Postgres separate from Frontline's Supabase project (this service is a distinct trust boundary — a partner app's DB compromise shouldn't expose the ledger, and vice versa). Neon's serverless Postgres (scales to zero, free tier) is a reasonable cheap starting point; a small dedicated Supabase project works too if consistency with the existing stack is preferred over Neon's scale-to-zero cost benefit.
- **Linking frontend** (if/when built): a minimal Next.js app, could live on the same free-tier hosting as the API, or even Vercel's free tier since it's mostly static + a few auth/link-flow routes.

## Suggested phase order

1. Design + build the core ledger service (`accounts` + `ledger` tables, API for balance read, credit, debit, transaction history), no linking, single partner (`app_id = 'frontline'`) hardcoded to start.
2. Integrate Frontline as the first real consumer — likely replacing or backing onto whatever Frontline's current points balance logic is, swapped to call out to this service instead of (or in addition to) its own tables.
3. Once there's an actual second partner app on the horizon, build the opt-in linking frontend (steps in "identity-linking" section above) as its own small service.
4. Legal check on redemption-across-businesses model before any real-money/real-discount redemption crosses from "within Frontline's partner network" to "across independently-owned apps' networks."
