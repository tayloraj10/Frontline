"""Where Stripe sends people back to after a hosted page (payout onboarding, card setup).

Stripe only redirects to https URLs. In the mobile apps that page opens in the phone's browser, so
we send people to a small bounce page (`/stripe-return`) that offers a "Return to the app" button.
The page forwards to `next`, which is always a path on our own site.
"""

from urllib.parse import quote


def stripe_return_url(base: str, path: str, query: str = "", from_app: bool = False) -> str:
    """https URL of the bounce page for a destination path, e.g. ('/groups/x/edit', 'payouts=return').

    from_app is true only when the flow started in the native app; the bounce page then offers the
    "Return to the app" button, otherwise it sends web visitors straight back to the site.
    """
    destination = f"{path}?{query}" if query else path
    url = f"{base.rstrip('/')}/stripe-return?next={quote(destination, safe='')}"
    return f"{url}&app=1" if from_app else url
