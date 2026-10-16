"""Aggregate-only numbers for the public Impact & Funding page. No personal data."""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# A cleanup counts once it has actually happened: solo logs are 'completed' on creation, but
# group events keep status 'scheduled' after the date passes, so count a past, non-cancelled
# event that has logged totals or check-ins.
HAPPENED = """(
    cl.status IN ('completed', 'verified', 'addressed')
    OR (
        cl.status IN ('scheduled', 'in_progress')
        AND COALESCE(cl.scheduled_end, cl.scheduled_start) < now()
        AND (
            cl.metrics_pounds IS NOT NULL OR cl.metrics_small_bags IS NOT NULL OR cl.metrics_large_bags IS NOT NULL
            OR EXISTS (SELECT 1 FROM contributions k WHERE k.cleanup_event_id = cl.id)
        )
    )
)"""


async def get_impact_summary(db: AsyncSession) -> dict:
    money = (
        await db.execute(
            text("""
                SELECT
                    COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('funded', 'released', 'exhausted') AND model <> 'general'), 0)::bigint AS sponsored_cents,
                    COUNT(*) FILTER (WHERE status IN ('funded', 'released', 'exhausted') AND model <> 'general')::int AS sponsorship_count,
                    COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('funded', 'released', 'exhausted') AND model = 'general'), 0)::bigint AS donated_cents,
                    COUNT(*) FILTER (WHERE status IN ('funded', 'released', 'exhausted') AND model = 'general')::int AS donation_count
                FROM sponsorships
            """)
        )
    ).one()
    monthly = (
        await db.execute(
            text("""
                SELECT to_char(m, 'YYYY-MM') AS month,
                       COALESCE(SUM(s.amount_cents), 0)::bigint AS gifts_cents,
                       (SELECT COUNT(*) FROM subscriptions sb
                         WHERE date_trunc('month', sb.created_at) = m)::int AS new_supporters
                FROM generate_series(date_trunc('month', now()) - interval '11 months',
                                     date_trunc('month', now()), interval '1 month') AS m
                LEFT JOIN sponsorships s
                  ON date_trunc('month', s.funded_at) = m AND s.status IN ('funded', 'released', 'exhausted')
                GROUP BY m ORDER BY m
            """)
        )
    ).mappings().all()
    ledger = (
        await db.execute(
            text("""
                SELECT
                    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'approved'), 0)::bigint AS owed_cents,
                    COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid_out'), 0)::bigint AS paid_cents
                FROM sponsorship_allocations
            """)
        )
    ).one()
    supporters = (
        await db.execute(
            text("SELECT COUNT(*)::int FROM subscriptions WHERE status IN ('active', 'trialing')")
        )
    ).scalar_one()

    impact = (
        await db.execute(
            text(f"""
                SELECT
                    COUNT(*)::int AS cleanups,
                    COALESCE(SUM(COALESCE(metrics_small_bags, 0) + COALESCE(metrics_large_bags, 0)), 0)::int AS bags,
                    COALESCE(SUM(metrics_pounds), 0)::float AS pounds
                FROM cleanups cl
                WHERE {HAPPENED}
            """)
        )
    ).one()
    participants = (
        await db.execute(
            text(f"""
                SELECT COUNT(DISTINCT u)::int FROM (
                    SELECT unnest(attended_user_ids) AS u FROM cleanups cl WHERE {HAPPENED}
                    UNION
                    SELECT user_id FROM contributions
                    WHERE user_id IS NOT NULL
                      AND (cleanup_id IS NOT NULL OR cleanup_event_id IS NOT NULL)
                ) t
            """)
        )
    ).scalar_one()

    partners = (
        await db.execute(
            text("""
                SELECT id::text, name, slug, logo_url, website_url
                FROM partner_businesses
                WHERE status = 'active'
                ORDER BY name
            """)
        )
    ).mappings().all()

    return {
        "money": {
            "sponsored_cents": money.sponsored_cents,
            "sponsorship_count": money.sponsorship_count,
            "donated_cents": money.donated_cents,
            "donation_count": money.donation_count,
            "monthly": [dict(r) for r in monthly],
            "active_supporters": supporters,
            "owed_to_cleaners_cents": ledger.owed_cents,
            "paid_out_cents": ledger.paid_cents,
        },
        "impact": {
            "cleanups_completed": impact.cleanups,
            "bags_collected": impact.bags,
            "pounds_collected": impact.pounds,
            "participants": participants,
        },
        "partners": [dict(p) for p in partners],
    }
