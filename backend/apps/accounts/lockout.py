"""登录失败锁定：5 次失败后锁 15 分钟（按 username + IP 维度）。

依赖 Django cache backend。LocMemCache（默认）单进程内有效；
生产建议切到 Redis 以便多 worker 共享计数。
"""
from __future__ import annotations

from datetime import datetime, timedelta

from django.core.cache import cache
from django.utils import timezone

MAX_FAILURES = 5
LOCKOUT_SECONDS = 15 * 60
COUNTER_TTL = LOCKOUT_SECONDS  # 与锁定窗口对齐，超时自动归零


def _key(username: str, ip: str | None) -> str:
    return f"login_failures:{username.lower()}:{ip or 'noip'}"


def _lock_key(username: str, ip: str | None) -> str:
    return f"login_lock_until:{username.lower()}:{ip or 'noip'}"


def is_locked_out(username: str, ip: str | None) -> datetime | None:
    iso = cache.get(_lock_key(username, ip))
    if not iso:
        return None
    until = datetime.fromisoformat(iso)
    if until <= timezone.now():
        cache.delete(_lock_key(username, ip))
        return None
    return until


def register_failure(username: str, ip: str | None) -> int:
    """返回剩余可尝试次数（0 表示触发锁定）。"""
    key = _key(username, ip)
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, COUNTER_TTL)
        count = 1
    remaining = max(MAX_FAILURES - count, 0)
    if count >= MAX_FAILURES:
        until = timezone.now() + timedelta(seconds=LOCKOUT_SECONDS)
        cache.set(_lock_key(username, ip), until.isoformat(), LOCKOUT_SECONDS)
    return remaining


def reset_failures(username: str, ip: str | None) -> None:
    cache.delete(_key(username, ip))
    cache.delete(_lock_key(username, ip))
