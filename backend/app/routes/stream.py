import asyncio
import json
import math
import random

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from .runs import runs

router = APIRouter()

FAST_STORAGE_MS = 3.0
SLOW_STORAGE_MS = 80.0
SLOW_STORAGE_STD = 10.0

# RPS saturation thresholds
SERVER_RPS_SAT = 30
DB_RPS_SAT = 15


def estimate_think_time(platform: str) -> float:
    """Estimate average seconds between requests per user based on platform type."""
    p = platform.lower()
    if any(w in p for w in ["social", "chat", "feed", "messaging", "realtime", "real-time"]):
        return 2.0
    if any(w in p for w in ["ecommerce", "shop", "store", "marketplace", "browse"]):
        return 3.5
    if any(w in p for w in ["task", "todo", "project", "management", "board", "tracker"]):
        return 5.0
    if any(w in p for w in ["analytics", "dashboard", "monitor"]):
        return 4.0
    if any(w in p for w in ["api", "microservice", "service", "gateway"]):
        return 1.0
    return 3.0


def sigmoid_error(rps: float, sat: float, k: float = 3.0) -> float:
    """Smooth S-curve: 0 below sat, 0.5 at sat, approaches 1 above sat."""
    ratio = rps / sat
    return 1.0 / (1.0 + math.exp(-k * (ratio - 1.0)))


@router.get("/api/runs/{run_id}/stream")
async def stream_run(run_id: str):
    run = runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    config = run["config"]
    duration = config["duration"]
    ramp_up = config.get("ramp_up", 5)
    max_concurrency = config.get("concurrency", 10)
    platform = config.get("platform", "")

    think_time = estimate_think_time(platform)

    base = 2.0

    async def event_stream():
        nonlocal base

        for t in range(1, duration + 1):
            await asyncio.sleep(1)

            # --- Load: RPS ramps smoothly via sigmoid load factor ---
            load_factor = min(1.0, t / max(ramp_up, 1))
            current_concurrency = max_concurrency * load_factor
            rps = current_concurrency / think_time

            # --- Error rates (sigmoid, smooth) ---
            cache_pct = round(sigmoid_error(rps, SERVER_RPS_SAT) * 100, 1)
            no_cache_pct = round(sigmoid_error(rps, DB_RPS_SAT) * 100, 1)

            # --- Base latency: driven by RPS ---
            target = 3.0 + rps * 0.08

            base += (target - base) * random.uniform(0.1, 0.4)
            base += random.gauss(0, 1.0)

            if random.random() < 0.08:
                base += random.uniform(5, 15)

            base = max(1.0, base)

            cache = round(base + FAST_STORAGE_MS, 1)
            no_cache = round(
                base + max(0, random.gauss(SLOW_STORAGE_MS, SLOW_STORAGE_STD)),
                1,
            )

            data = json.dumps({
                "t": t,
                "cache": cache,
                "noCache": no_cache,
                "cachePct": cache_pct,
                "noCachePct": no_cache_pct,
            })
            yield f"data: {data}\n\n"

        yield "data: {\"done\": true}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
