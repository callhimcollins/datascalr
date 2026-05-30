from __future__ import annotations

import json
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..supabase_client import update

router = APIRouter()

SYSTEM_PROMPT = """You are a load-testing analyst. You receive metrics from a simulation that compared cached (Redis) vs uncached (PostgreSQL direct) latency for a web API under concurrent virtual users.

Architecture context (use this to interpret results):
- Virtual users fire real HTTP requests through an httpx client with a connection pool (max 1000 connections). When VUs exceed 1000, requests queue waiting for an available connection.
- Redis is single-threaded. Under high concurrency, operations queue at the Redis event loop, showing as higher cache latency — but this is queuing delay, not slow Redis performance.
- PostgreSQL has a connection pool (max_size=4). Uncached queries that exceed 4 concurrent connections queue at the PG pool, causing timeouts under high load.
- "Miss rate" means the Redis key had expired (TTL-based), so the request fell through to PostgreSQL. It does NOT mean cache eviction. The average miss rate can be low (e.g. 1-2%) if most ticks have 0% but a few spike to 10-20% — this means the cache works most of the time but periodic TTL expiry causes brief repopulation storms.
- All errors are httpx timeouts (10s timeout). They occur when requests queue longer than 10s waiting for httpx connections, PG connections, or Redis operations.

Your job: analyze the metrics and produce a specific, run-specific explanation and recommendation.

Write your response as a single JSON object with two fields:
{
  "why": "1-3 sentence explanation. Lead with what the data actually shows (numbers), then diagnose the bottleneck layer. Be specific about which layer caused the result.",
  "recommendation": "1-3 sentence actionable recommendation. Name a specific change with a specific target — a config value, a pool size, a TTL number, a code change. Avoid vague advice like 'consider scaling' or 'test with a different approach'."
}

Rules:
- Be conversational and direct. Use "cache" and "no-cache" terminology.
- First identify the bottleneck: is it httpx pool saturation (both paths slow + errors), Redis saturation (cache specifically degrades), PG pool saturation (no-cache specifically degrades), or mixed?
- If total throughput is far below concurrency (e.g. 118 req/s at 3500 VUs), the bottleneck is httpx connection pool saturation. Name it explicitly.
- Consider the weight split: if cache gets more traffic (e.g. 75%), its average latency is inflated by queueing more requests at the httpx pool.
- A low average miss rate with occasional spikes means TTL expiry storms — the cache works fine until a batch of keys expire simultaneously.
- Reference specific numbers from the metrics and say what they mean. Do not just restate them.
- Make the recommendation specific to this run's bottleneck. If httpx pool is the bottleneck, recommend a specific pool size or concurrency limit. If PG is the bottleneck, recommend a specific pool_size or query optimization. If Redis is the bottleneck, recommend a specific configuration change.
- Avoid generic or repeated advice like "test with a smaller TTL" or "scale Redis" without tying it to a specific number from this run.
- Do NOT use markdown code fences or any text outside the JSON.
"""


class AnalysisRequest(BaseModel):
    avg_cache_ms: float
    avg_no_cache_ms: float
    max_cache_ms: float
    max_no_cache_ms: float
    avg_miss_rate: float | None = None
    max_miss_rate: float | None = None
    cache_error_ticks: int
    no_cache_error_ticks: int
    total_ticks: int
    avg_rps: float
    concurrency: int
    ramp_up: int
    duration: int
    winner: str
    percentage_faster: float
    profile_label: str = ""
    cache_weight: float = 0.5
    no_cache_weight: float = 0.5
    total_throughput: int | None = None
    run_id: str | None = None


@router.post("/api/analyze-run")
async def analyze_run(req: AnalysisRequest):
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not configured")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {
                            "role": "user",
                            "content": json.dumps({
                                "profile": req.profile_label or "custom",
                                "concurrency": req.concurrency,
                                "ramp_up": req.ramp_up,
                                "duration": req.duration,
                                "avg_cache_ms": req.avg_cache_ms,
                                "avg_no_cache_ms": req.avg_no_cache_ms,
                                "max_cache_ms": req.max_cache_ms,
                                "max_no_cache_ms": req.max_no_cache_ms,
                                "avg_miss_rate_pct": req.avg_miss_rate,
                                "peak_miss_rate_pct": req.max_miss_rate,
                                "cache_error_ticks_out_of": f"{req.cache_error_ticks}/{req.total_ticks}",
                                "no_cache_error_ticks_out_of": f"{req.no_cache_error_ticks}/{req.total_ticks}",
                                "avg_throughput_rps": round(req.avg_rps),
                                "total_throughput": req.total_throughput,
                                "winner": req.winner,
                                "faster_pct": round(req.percentage_faster, 1),
                                "cache_weight_pct": round(req.cache_weight * 100),
                                "no_cache_weight_pct": round(req.no_cache_weight * 100),
                            }),
                        },
                    ],
                    "max_tokens": 512,
                    "response_format": {"type": "json_object"},
                },
            )

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"DeepSeek API error ({resp.status_code}): {resp.text}",
                )

            body = resp.json()
            text = body["choices"][0]["message"]["content"].strip()

        data = json.loads(text)
        analysis = {"why": data.get("why", ""), "recommendation": data.get("recommendation", "")}

        if req.run_id:
            try:
                await update("simulation_runs", "id", req.run_id, {"analysis": analysis})
            except Exception:
                pass  # best-effort persistence

        return analysis

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {e}")
