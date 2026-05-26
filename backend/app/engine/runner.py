from __future__ import annotations

import asyncio

import httpx

from ..metrics.collector import MetricsCollector
from .utils import estimate_think_time
from .virtual_user import virtual_user_loop


async def run_engine(
    config: dict,
    collector: MetricsCollector,
    stop_event: asyncio.Event,
    vu_tasks: list[asyncio.Task],
) -> None:
    """Spawn VUs staggered over ramp-up, run until stop_event is set."""
    max_vus = config["concurrency"]
    ramp_up = max(config["ramp_up"], 0)
    base_think_time = estimate_think_time(config.get("platform", ""))

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(10.0),
        limits=httpx.Limits(max_connections=1000, max_keepalive_connections=200),
    ) as client:
        for i in range(max_vus):
            if stop_event.is_set():
                break
            task = asyncio.create_task(
                virtual_user_loop(i, config, collector, client, stop_event, base_think_time)
            )
            vu_tasks.append(task)
            if ramp_up > 0:
                await asyncio.sleep(ramp_up / max_vus)

        await stop_event.wait()
