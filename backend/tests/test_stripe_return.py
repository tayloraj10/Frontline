from urllib.parse import parse_qs, urlparse

from app.services.stripe_return import stripe_return_url


def _next(url: str) -> str:
    return parse_qs(urlparse(url).query)["next"][0]


def test_points_at_bounce_page_with_encoded_destination():
    url = stripe_return_url("https://www.frontlinemaps.com/", "/groups/x/edit", "payouts=return")
    assert url.startswith("https://www.frontlinemaps.com/stripe-return?next=")
    assert _next(url) == "/groups/x/edit?payouts=return"


def test_keeps_existing_query_in_path():
    url = stripe_return_url("https://www.frontlinemaps.com", "/marketplace/post?cleaner=abc")
    assert _next(url) == "/marketplace/post?cleaner=abc"
    assert "?cleaner" not in url.split("next=")[1]
