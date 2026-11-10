"""Basic checks on job chat. Contact details and off-app payment are refused; abusive or threatening
language goes through but is flagged for an admin."""
import re

_CONTACT = [
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"),  # email
    re.compile(r"(?:\+?\d[\s().-]*){7,}"),  # phone number
    re.compile(r"https?://|www\.|\b\w+\.(?:com|net|org|io|co|me|app)\b", re.I),  # link
    re.compile(r"\b(?:venmo|cash\s?app|zelle|paypal|apple\s?pay|whatsapp|telegram|snapchat|instagram|text me|call me)\b", re.I),
]
_THREAT = re.compile(
    r"\b(?:kill|hurt|beat|stab|shoot)\s+(?:you|u|him|her|them)\b|\bi(?:'ll| will) find you\b|\bwatch your back\b|\bi know where you live\b",
    re.I,
)
_ABUSE = re.compile(
    r"\b(?:fuck\w*|shit\w*|bitch\w*|asshole|bastard|cunt|dickhead|motherfucker|retard\w*|slut|whore|nigg\w+|fagg?\w*)\b", re.I
)


def has_contact_info(body: str) -> bool:
    return any(p.search(body) for p in _CONTACT)


def flag_reason(body: str) -> str | None:
    if _THREAT.search(body):
        return "threat"
    if _ABUSE.search(body):
        return "abusive language"
    return None
