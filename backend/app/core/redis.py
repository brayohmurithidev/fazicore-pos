from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

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
    import json
    r = await get_redis()
    await r.setex(key, ttl, json.dumps(value))


async def get_cache(key: str) -> Any | None:
    import json
    r = await get_redis()
    data = await r.get(key)
    return json.loads(data) if data else None


async def delete_cache(key: str) -> None:
    r = await get_redis()
    await r.delete(key)


async def delete_pattern(pattern: str) -> None:
    r = await get_redis()
    keys = await r.keys(pattern)
    if keys:
        await r.delete(*keys)
