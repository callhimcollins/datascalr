from __future__ import annotations

import asyncio
import random
import time

import httpx

from .utils import build_body, build_url, pick_endpoint
from ..metrics.collector import MetricsCollector, Sample


def _calc_think_time(is_rate_limit_mode: bool, base_think_time: float) -> float:
    if is_rate_limit_mode:
        return max(0.05, random.gauss(0.15, 0.05))
    return max(0.5, random.gauss(base_think_time, base_think_time * 0.3))


def _build_headers(is_rate_limit_mode: bool, config: dict, vu_id: int) -> dict:
    if not is_rate_limit_mode:
        return {}
    rps = config.get("rate_limit_rps", 10)
    return {"X-VU-ID": str(vu_id), "X-RateLimit-RPS": str(rps)}


async def _execute_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    body: dict | None,
    headers: dict,
) -> tuple[int, str | None, httpx.Response | None]:
    try:
        resp = await asyncio.wait_for(
            client.request(method=method, url=url, json=body, headers=headers, timeout=10.0),
            timeout=10.0,
        )
        status_code = resp.status_code
        error = f"http_{status_code}" if status_code >= 400 else None
        return status_code, error, resp
    except (httpx.TimeoutException, asyncio.TimeoutError):
        return 0, "timeout", None
    except httpx.RequestError as e:
        return 0, f"connection_error: {type(e).__name__}", None


def _parse_cache_hit(
    is_cached: bool,
    error: str | None,
    status_code: int,
    resp: httpx.Response | None,
) -> bool | None:
    if not is_cached or error is not None or resp is None or not status_code:
        return None
    cache_header = resp.headers.get("x-cache")
    if cache_header == "HIT":
        return True
    if cache_header == "MISS":
        return False
    return None


async def virtual_user_loop(
    vu_id: int,
    config: dict,
    collector: MetricsCollector,
    client: httpx.AsyncClient,
    stop_event: asyncio.Event,
    base_think_time: float,
) -> None:
    """Single virtual user coroutine.

    Picks endpoints by weight, fires real HTTP requests, records latency
    and errors, and reports samples to the shared MetricsCollector.
    """
    endpoints = config.get("endpoints", [])
    cached = config.get("target_cached_only", False)
    is_rate_limit_mode = config.get("mode") == "rate_limiting"

    while not stop_event.is_set():
        think_time = _calc_think_time(is_rate_limit_mode, base_think_time)

        endpoint = pick_endpoint(endpoints)
        url = build_url(config["base_url"], endpoint)
        body = build_body(endpoint.get("body_template"))
        is_cached = cached or "cached=true" in url.lower()
        headers = _build_headers(is_rate_limit_mode, config, vu_id)

        start = time.monotonic()
        status_code, error, resp = await _execute_request(
            client, endpoint["method"], url, body, headers,
        )
        latency = (time.monotonic() - start) * 1000

        cache_hit = _parse_cache_hit(is_cached, error, status_code, resp)

        collector.add_sample(Sample(
            latency_ms=latency,
            status_code=status_code,
            cached=is_cached,
            cache_hit=cache_hit,
            error=error,
            rate_limited=status_code == 429,
            vu_id=vu_id,
        ))

        await asyncio.sleep(think_time)
