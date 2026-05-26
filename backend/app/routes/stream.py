from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .runs import runs
from ..engine import run_engine
from ..metrics.analysis import analyze
from ..metrics.collector import MetricsCollector

router = APIRouter()

SAVE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "simulation_runs"


def _save_run(run_id: str, run: dict) -> None:
    metrics = run.get("metrics", [])
    config = run.get("config", {})

    cache_vals = [m["cacheHit"] for m in metrics if m.get("cacheHit") is not None]
    no_cache_vals = [m["noCache"] for m in metrics if m.get("noCache") is not None]

    # Compute steady-state averages (skip ramp-up period)
    ramp_up = config.get("ramp_up", 0)
    steady_state_start = max(ramp_up + 1, 1)
    cache_steady = [m["cacheHit"] for m in metrics[steady_state_start:] if m.get("cacheHit") is not None]
    no_cache_steady = [m["noCache"] for m in metrics[steady_state_start:] if m.get("noCache") is not None]

    avg_cache = round(sum(cache_vals) / len(cache_vals), 1) if cache_vals else 0.0
    avg_no_cache = round(sum(no_cache_vals) / len(no_cache_vals), 1) if no_cache_vals else 0.0
    avg_cache_steady = round(sum(cache_steady) / len(cache_steady), 1) if cache_steady else 0.0
    avg_no_cache_steady = round(sum(no_cache_steady) / len(no_cache_steady), 1) if no_cache_steady else 0.0

    # Compute comparison
    comparison = None
    if avg_cache_steady > 0 and avg_no_cache_steady > 0:
        diff = avg_no_cache_steady - avg_cache_steady
        pct_diff = (diff / avg_no_cache_steady) * 100 if avg_no_cache_steady > 0 else 0
        comparison = {
            "cache_ms": avg_cache_steady,
            "no_cache_ms": avg_no_cache_steady,
            "difference_ms": round(diff, 1),
            "percentage_faster": round(pct_diff, 1),
            "winner": "cache" if diff > 0 else "no_cache" if diff < 0 else "tie",
        }

    data = {
        "run_id": run_id,
        "config": config,
        "avg_cache_ms": avg_cache,
        "avg_no_cache_ms": avg_no_cache,
        "avg_cache_steady_ms": avg_cache_steady,
        "avg_no_cache_steady_ms": avg_no_cache_steady,
        "comparison": comparison,
        "metrics": metrics,
    }

    import datetime
    SAVE_DIR.mkdir(exist_ok=True)
    safe = f"{str(config.get('platform', ''))[:20]}_{config.get('concurrency', '?')}u_{config.get('duration', '?')}s"
    safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in safe)
    ts = datetime.datetime.now().strftime("%I_%M%p").lower()
    path = SAVE_DIR / f"{run_id}_{ts}_{safe}.json"
    path.write_text(json.dumps(data, indent=2))


@router.get("/api/runs/{run_id}/stream")
async def stream_run(run_id: str, request: Request):
    run = runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    config = run["config"]
    collector = MetricsCollector()
    stop_event = asyncio.Event()
    vu_tasks: list[asyncio.Task] = []

    async def event_stream():
        engine_task = asyncio.create_task(
            run_engine(config, collector, stop_event, vu_tasks)
        )

        history: list[dict] = []
        analysis_state: dict = {}

        try:
            for t in range(1, config["duration"] + 1):
                if await request.is_disconnected():
                    stop_event.set()
                    break

                await asyncio.sleep(1)

                bucket = collector.compute_bucket(t)
                bucket["events"] = analyze(t, bucket, config, history, analysis_state)
                run["metrics"].append(bucket)
                history.append(bucket)
                yield f"data: {json.dumps(bucket)}\n\n"
        finally:
            stop_event.set()

            for task in vu_tasks:
                task.cancel()
            engine_task.cancel()

            try:
                await engine_task
            except asyncio.CancelledError:
                pass

            for task in vu_tasks:
                try:
                    await task
                except asyncio.CancelledError:
                    pass

            run["status"] = "completed"
            _save_run(run_id, run)
            
            # Send final summary with comparison
            cache_vals = [m["cacheHit"] for m in run["metrics"] if m.get("cacheHit") is not None]
            no_cache_vals = [m["noCache"] for m in run["metrics"] if m.get("noCache") is not None]
            
            ramp_up = config.get("ramp_up", 0)
            steady_state_start = max(ramp_up + 1, 1)
            cache_steady = [m["cacheHit"] for m in run["metrics"][steady_state_start:] if m.get("cacheHit") is not None]
            no_cache_steady = [m["noCache"] for m in run["metrics"][steady_state_start:] if m.get("noCache") is not None]
            
            avg_cache_steady = round(sum(cache_steady) / len(cache_steady), 1) if cache_steady else 0.0
            avg_no_cache_steady = round(sum(no_cache_steady) / len(no_cache_steady), 1) if no_cache_steady else 0.0
            
            comparison = None
            if avg_cache_steady > 0 and avg_no_cache_steady > 0:
                diff = avg_no_cache_steady - avg_cache_steady
                pct_diff = (diff / avg_no_cache_steady) * 100 if avg_no_cache_steady > 0 else 0
                comparison = {
                    "cache_ms": avg_cache_steady,
                    "no_cache_ms": avg_no_cache_steady,
                    "difference_ms": round(diff, 1),
                    "percentage_faster": round(pct_diff, 1),
                    "winner": "cache" if diff > 0 else "no_cache" if diff < 0 else "tie",
                }
            
            yield f"data: {json.dumps({'done': True, 'comparison': comparison})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
