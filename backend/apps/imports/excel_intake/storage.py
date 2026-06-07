from __future__ import annotations

import secrets

from django.core.cache import cache
from rest_framework.exceptions import ValidationError

TOKEN_PREFIX = "excel-intake:"
TOKEN_TTL_SECONDS = 60 * 60


def save_upload(filename: str, content: bytes) -> str:
    if not filename.lower().endswith(".xlsx"):
        raise ValidationError({"file": "只支持 .xlsx 文件"})
    if not content:
        raise ValidationError({"file": "文件不能为空"})
    token = secrets.token_urlsafe(24)
    cache.set(_cache_key(token), {"filename": filename, "content": content}, TOKEN_TTL_SECONDS)
    return token


def get_upload(upload_token: object) -> tuple[str, bytes]:
    if not isinstance(upload_token, str) or not upload_token.strip():
        raise ValidationError({"upload_token": "必填"})
    item = cache.get(_cache_key(upload_token.strip()))
    if item is None:
        raise ValidationError({"upload_token": "上传 token 已过期"})
    return item["filename"], item["content"]


def _cache_key(token: str) -> str:
    return f"{TOKEN_PREFIX}{token}"
