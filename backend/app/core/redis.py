import json
import logging
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

log = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def set_cache(key: str, value: Any, ttl: int = 300) -> None:
    try:
        r = await get_redis()
        await r.setex(key, ttl, json.dumps(value))
    except Exception as exc:
        log.debug("Redis set_cache failed for %s: %s", key, exc)


async def get_cache(key: str) -> Any | None:
    try:
        r = await get_redis()
        data = await r.get(key)
        return json.loads(data) if data else None
    except Exception as exc:
        log.debug("Redis get_cache failed for %s: %s", key, exc)
        return None


async def delete_cache(key: str) -> None:
    try:
        r = await get_redis()
        await r.delete(key)
    except Exception as exc:
        log.debug("Redis delete_cache failed for %s: %s", key, exc)


async def delete_pattern(pattern: str) -> None:
    try:
        r = await get_redis()
        keys = await r.keys(pattern)
        if keys:
            await r.delete(*keys)
    except Exception as exc:
        log.debug("Redis delete_pattern failed for %s: %s", pattern, exc)
