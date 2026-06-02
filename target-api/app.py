import json
import os
import time

import asyncpg
import redis.asyncio as aioredis
from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse

app = FastAPI(title="target-api", version="0.1.0")

DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]

CACHE_TTL = 10

# Per-VU rate limiting (fixed 1-second window, activated by X-VU-ID header)
# Each VU sends X-RateLimit-RPS to set its own ceiling (per-request override)
_rate_limit_buckets: dict[str, dict] = {}


def _check_rate_limit(vu_id: str, max_rps: int) -> bool:
    """Return True if the request should be allowed, False if rate-limited."""
    now = time.monotonic()
    bucket = _rate_limit_buckets.get(vu_id)

    if bucket is None or now - bucket["window_start"] >= 1.0:
        # New window — use the ceiling from the request header
        _rate_limit_buckets[vu_id] = {"count": 1, "window_start": now, "limit": max_rps}
        return True

    if bucket["count"] >= bucket["limit"]:
        return False  # rate-limited

    bucket["count"] += 1
    return True


@app.on_event("startup")
async def startup():
    app.state.pg = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=4)
    app.state.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)


@app.on_event("shutdown")
async def shutdown():
    await app.state.pg.close()
    await app.state.redis.close()


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    vu_id = request.headers.get("X-VU-ID")
    if vu_id is not None and request.url.path.startswith("/api/"):
        max_rps = int(request.headers.get("X-RateLimit-RPS", "10"))
        if not _check_rate_limit(vu_id, max_rps):
            return JSONResponse(
                status_code=429,
                content={"error": "rate_limit_exceeded", "message": f"Max {max_rps} req/s per user exceeded", "vu_id": vu_id},
                headers={"X-RateLimit-Limit": str(max_rps), "X-RateLimit-VU-ID": vu_id},
            )
    return await call_next(request)


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _get_items(limit: int = 100):
    async with app.state.pg.acquire() as conn:
        rows = await conn.fetch(f"SELECT id, name, data FROM items LIMIT {limit}")
    return {"count": len(rows), "items": [dict(r) for r in rows]}


async def _search_items(term: str):
    async with app.state.pg.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, data FROM items "
            "WHERE to_tsvector('english', "
            "  name || ' ' || COALESCE(data->>'description', '') || ' ' || COALESCE(data->>'category', '')"
            ") @@ plainto_tsquery('english', $1) "
            "LIMIT 20",
            term,
        )
    return {"count": len(rows), "items": [dict(r) for r in rows]}


async def _get_stats():
    async with app.state.pg.acquire() as conn:
        rows = await conn.fetch(
            "SELECT "
            "  data->>'category' as category, "
            "  COUNT(*)::int as count, "
            "  ROUND(AVG((data->>'price')::numeric), 2)::float as avg_price, "
            "  ROUND(AVG((data->>'rating')::numeric), 2)::float as avg_rating "
            "FROM items GROUP BY data->>'category' ORDER BY category"
        )
    return {"stats": [dict(r) for r in rows]}


@app.get("/api/items")
async def get_items(cached: bool = Query(False)):
    if cached:
        cached_data = await app.state.redis.get("items:all")
        if cached_data is not None:
            return JSONResponse(content=json.loads(cached_data), headers={"X-Cache": "HIT"})
        result = await _get_items(100)
        await app.state.redis.setex("items:all", CACHE_TTL, json.dumps(result))
        return JSONResponse(content=result, headers={"X-Cache": "MISS"})
    return await _get_items(100)


@app.get("/api/items/search")
async def search_items(q: str = Query(...), cached: bool = Query(False)):
    if cached:
        cache_key = f"search:{q.lower()}"
        cached_data = await app.state.redis.get(cache_key)
        if cached_data is not None:
            return JSONResponse(content=json.loads(cached_data), headers={"X-Cache": "HIT"})
        result = await _search_items(q)
        await app.state.redis.setex(cache_key, CACHE_TTL, json.dumps(result))
        return JSONResponse(content=result, headers={"X-Cache": "MISS"})
    return await _search_items(q)


@app.get("/api/items/stats")
async def get_stats(cached: bool = Query(False)):
    if cached:
        cached_data = await app.state.redis.get("items:stats")
        if cached_data is not None:
            return JSONResponse(content=json.loads(cached_data), headers={"X-Cache": "HIT"})
        result = await _get_stats()
        await app.state.redis.setex("items:stats", CACHE_TTL, json.dumps(result))
        return JSONResponse(content=result, headers={"X-Cache": "MISS"})
    return await _get_stats()
