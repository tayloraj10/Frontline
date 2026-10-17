# Supabase Backup Strategy (Free Tier) — Scoping (2026-08-28)

## Why

Downgrading Supabase from Pro to Free at the end of the current billing cycle
to save cost (see MapTiler/Supabase cost review, 2026-08-28). Free tier has
**no daily backups and no point-in-time recovery**. Since the app is in
production with real user data, we need a replacement backup mechanism before
relying on Free tier long-term.

## Size estimate (measured against local dev DB)

Ran a real `pg_dump` against the local Supabase Postgres container to get an
actual number rather than guessing:

| | Size |
|---|---|
| Local DB size (`pg_database_size`) | 132 MB |
| Plain SQL dump (uncompressed) | 168 MB |
| Gzip-compressed dump | **~63 MB** |

Production DB will be somewhat larger than local dev data, so treat this as a
floor, not a ceiling. Re-measure once the mechanism is live and compare
against real prod dump sizes.

## Storage target: Cloudflare R2

Already used elsewhere in the stack (tech stack notes), so no new vendor.

- **10 GB-month storage free**
- 1M Class A ops (writes) + 10M Class B ops (reads) free per month
- **Egress is always free on R2**, even past the free tier — restoring a dump
  never costs anything, unlike S3

At ~63 MB/dump and keeping every dump forever (no pruning, per user decision
2026-08-28 — will do a manual bulk wipe eventually instead of an automated
retention window):

| Cadence | Growth/year | Time to fill 10 GB free tier |
|---|---|---|
| Daily | ~23 GB/yr | ~5 months |
| Weekly | ~3.3 GB/yr | ~3 years |
| Twice-weekly | ~6.6 GB/yr | ~1.5 years |

Recommendation: **weekly or twice-weekly**, not daily — frequency isn't
critical for this use case and it buys years of runway on the free storage
tier before any cleanup is needed.

## Proposed mechanism

- New scheduled GitHub Action (mirrors the existing `supabase-keepalive.yml`
  pattern already in `.github/workflows/`).
- Runs `pg_dump` against the production Supabase DB connection string.
- Gzips the output.
- Uploads to an R2 bucket (new bucket, e.g. `frontline-db-backups`) via the S3
  API (`aws s3 cp` or `rclone`, R2 is S3-compatible).
- No automatic deletion/retention policy — keep everything for now, revisit
  with a manual bulk wipe later if storage becomes a concern.
- Needs: R2 bucket + API token (separate from the existing R2 usage, or
  reused if scoped appropriately), Supabase DB connection string as a GitHub
  Actions secret.

## Status

Not started — deferred for later work per user request 2026-08-28.
