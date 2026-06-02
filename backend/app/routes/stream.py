from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .runs import active_runs, stop_events
from ..engine import run_engine
from ..metrics.analysis import analyze
from ..metrics.collector import MetricsCollector
from ..metrics.comparison import compute_comparison
from ..supabase_client import update

router = APIRouter()


@router.get("/api/runs/{run_id}/stream")
async def stream_run(run_id: str, request: Request):
    run = active_runs.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    config = run["config"]
    collector = MetricsCollector()
    stop_event = asyncio.Event()
    vu_tasks: list[asyncio.Task] = []

    async def event_stream():
        stop_events[run_id] = stop_event
        was_stopped = False

        engine_task = asyncio.create_task(
            run_engine(config, collector, stop_event, vu_tasks)
        )

        history: list[dict] = []
        analysis_state: dict = {}

        try:
            for t in range(1, config["duration"] + 1):
                if await request.is_disconnected() or stop_event.is_set():
                    if stop_event.is_set():
                        was_stopped = True
                    stop_event.set()
                    break

                await asyncio.sleep(1)

                bucket = collector.compute_bucket(t)
                bucket["events"] = analyze(t, bucket, config, history, analysis_state)
                run["metrics"].append(bucket)
                history.append(bucket)
                yield f"data: {json.dumps(bucket)}\n\n"
        finally:
            stop_events.pop(run_id, None)
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

            status_label = "stopped" if was_stopped else "completed"
            run["status"] = status_label

            # Compute and persist to Supabase
            result = compute_comparison(run["metrics"], config)
            try:
                persist_fields: dict = {
                    "status": status_label,
                    "metrics": run["metrics"],
                    "comparison": result["comparison"],
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
                if config.get("mode") == "rate_limiting":
                    persist_fields["avg_rps"] = result.get("avg_rps")
                    persist_fields["avg_rl_pct"] = result.get("avg_rl_pct")
                    persist_fields["peak_rps"] = result.get("peak_rps")
                else:
                    persist_fields["avg_cache_ms"] = result.get("avg_cache_ms")
                    persist_fields["avg_no_cache_ms"] = result.get("avg_no_cache_ms")
                    persist_fields["avg_cache_steady_ms"] = result.get("avg_cache_steady_ms")
                    persist_fields["avg_no_cache_steady_ms"] = result.get("avg_no_cache_steady_ms")
                await update("simulation_runs", "id", run_id, persist_fields)
            except Exception:
                pass  # best-effort persistence

            # Send final summary
            comparison = result["comparison"]
            yield f"data: {json.dumps({'done': True, 'stopped': was_stopped, 'comparison': comparison})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
