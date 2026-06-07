from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .errors import OAuthCodeExchangeFailed, OAuthProfileFetchFailed


def get_json(url: str, params: dict[str, str], headers: dict[str, str] | None = None) -> dict:
    query = urlencode(params)
    request = Request(f"{url}?{query}", headers=headers or {})
    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise OAuthProfileFetchFailed() from exc


def post_form_json(url: str, data: dict[str, str], headers: dict[str, str] | None = None) -> dict:
    payload = urlencode(data).encode("utf-8")
    request = Request(
        url,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded", **(headers or {})},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise OAuthCodeExchangeFailed() from exc


def post_json(url: str, data: dict, headers: dict[str, str] | None = None) -> dict:
    payload = json.dumps(data).encode("utf-8")
    request = Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise OAuthCodeExchangeFailed() from exc
