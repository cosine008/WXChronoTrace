from __future__ import annotations

import re
import secrets
from urllib.parse import urlparse

LABEL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
LABEL_CODE_PREFIX = "CT-L"
LABEL_CODE_RANDOM_LENGTH = 16
LABEL_CODE_RE = re.compile(
    r"^CT-L-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$"
)
SCAN_PATH_RE = re.compile(r"(?:^|/)scan/([^/?#]+)", re.IGNORECASE)
WHITESPACE_RE = re.compile(r"\s+")


def generate_label_code() -> str:
    random_part = "".join(
        secrets.choice(LABEL_CODE_ALPHABET) for _ in range(LABEL_CODE_RANDOM_LENGTH)
    )
    return _format_random_part(random_part)


def normalize_label_code(raw: object) -> str:
    text = "" if raw is None else str(raw).strip()
    if not text:
        raise ValueError("无效标签码")

    candidate = _extract_candidate(text)
    compact = WHITESPACE_RE.sub("", candidate).upper()
    if compact.startswith(f"{LABEL_CODE_PREFIX}-"):
        random_part = compact[len(LABEL_CODE_PREFIX) + 1 :].replace("-", "")
    else:
        raise ValueError("无效标签码")

    if len(random_part) != LABEL_CODE_RANDOM_LENGTH:
        raise ValueError("无效标签码")
    if any(char not in LABEL_CODE_ALPHABET for char in random_part):
        raise ValueError("无效标签码")

    normalized = _format_random_part(random_part)
    if not LABEL_CODE_RE.match(normalized):
        raise ValueError("无效标签码")
    return normalized


def _extract_candidate(text: str) -> str:
    parsed = urlparse(text)
    source = parsed.path if parsed.scheme and parsed.netloc else text
    match = SCAN_PATH_RE.search(source)
    if match:
        return match.group(1)
    return source


def _format_random_part(random_part: str) -> str:
    groups = [random_part[index : index + 4] for index in range(0, len(random_part), 4)]
    return f"{LABEL_CODE_PREFIX}-{'-'.join(groups)}"
