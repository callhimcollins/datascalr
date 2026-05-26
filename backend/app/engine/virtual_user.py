from __future__ import annotations

import asyncio
import random
import time

import httpx

from .utils import build_body, build_url, estimate_think_time, pick_endpoint
from ..metrics.collector import MetricsCollector, Sample


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
    think_time = max(0.5, random.gauss(base_think_time, base_think_time * 0.3))
    endpoints = config.get("endpoints", [])
    cached = config.get("target_cached_only", False)

    while not stop_event.is_set():
        endpoint = pick_endpoint(endpoints)
        url = build_url(config["base_url"], endpoint)
        body = build_body(endpoint.get("body_template"))
        is_cached = cached or "cached=true" in url.lower()

        start = time.monotonic()
        error: str | None = None
        status_code = 0

        try:
            resp = await client.request(
                method=endpoint["method"],
                url=url,
                json=body,
                timeout=10.0,
            )
            status_code = resp.status_code
            if status_code >= 400:
                error = f"http_{status_code}"
        except httpx.TimeoutException:
            error = "timeout"
        except httpx.RequestError as e:
            error = f"connection_error: {type(e).__name__}"

        latency = (time.monotonic() - start) * 1000

        collector.add_sample(Sample(
            latency_ms=latency,
            status_code=status_code,
            cached=is_cached,
            error=error,
        ))

        await asyncio.sleep(think_time)
