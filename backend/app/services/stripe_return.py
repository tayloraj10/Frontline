"""Where Stripe sends people back to after a hosted page (payout onboarding, card setup).

Stripe only redirects to https URLs. In the mobile apps that page opens in the phone's browser, so
we send people to a small bounce page (`/stripe-return`) that offers a "Return to the app" button.
The page forwards to `next`, which is always a path on our own site.
"""

from urllib.parse import quote


def stripe_return_url(base: str, path: str, query: str = "") -> str:
    """https URL of the bounce page for a destination path, e.g. ('/groups/x/edit', 'payouts=return')."""
    destination = f"{path}?{query}" if query else path
    return f"{base.rstrip('/')}/stripe-return?next={quote(destination, safe='')}"
