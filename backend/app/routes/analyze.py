from __future__ import annotations

import json
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..supabase_client import update

router = APIRouter()

SYSTEM_PROMPT = """You're a sharp engineer reading a load-test report. The test compared Redis-cached endpoints against direct PostgreSQL queries under concurrent virtual users. Your job is to tell the reader what happened and what to do about it — in plain English, no fluff.

**Architecture (know this cold):**
- Virtual users fire real HTTP through httpx (pool: 1000 connections max). When concurrent VUs exceed 1000, requests queue at the HTTP layer.
- Redis is single-threaded. High concurrency queues operations at its event loop — cache latency goes up, but that's queueing delay, not slow Redis.
- PostgreSQL pool is tiny (max_size=4). Uncached queries beyond 4 concurrent connections queue at PG. This is almost always the first bottleneck to show up.
- "Miss rate" = Redis key expired (TTL-based), so the request fell through to PG. NOT cache eviction. Low average (1-2%) with occasional spikes (10-20%) means the cache works fine most of the time but periodic TTL expiry causes brief repopulation storms.
- All errors are httpx 10s timeouts — requests queued longer than 10s waiting for httpx, PG, or Redis.

**How to diagnose the bottleneck layer:**

Look at the cross-section of latency, errors, and throughput together. One signal alone is misleading.

| Signal pattern | Bottleneck |
|---|---|
| Both cache & no-cache latency high, both have errors, throughput ≪ concurrency | httpx pool saturation — requests queueing at HTTP layer |
| Cache latency specifically degrades, errors on cache path | Redis saturation — single thread can't keep up |
| No-cache latency degrades while cache stays fast, errors only on no-cache | PG pool saturation — the tiny 4-connection pool is the bottleneck |
| No-cache spikes but no errors, low miss rate | PG pool is queuing but not overflowing — pool is struggling but coping |
| Both fast at low concurrency, cross over at higher concurrency | You hit two bottlenecks: PG pool fills first (no-cache climbs), then httpx pool (both climb) |

**Cross-pattern signals that matter:**
- Throughput ≪ concurrency (e.g. 74 req/s at 200 VUs) means requests are spending most of their time waiting, not doing work. Identify *where* they're waiting.
- Weight split matters. If cache handles 80% of traffic, its latency includes queueing more requests at httpx — it looks worse than it is.
- No errors + low latency = system is fine. Don't recommend changes.
- Errors on one path + clean on the other = the bottleneck is at that layer, not httpx.
- If both paths have errors and throughput collapsed, httpx pool is saturated regardless of which path has worse latency.
- A run where cache has *slightly worse* latency than no-cache at high concurrency means Redis queueing caught up to PG queueing — not that no-cache is "faster."

**Writing voice:**
- Conversational and direct. Sound like a senior engineer explaining findings to a teammate — no corporate padding, no "it is recommended."
- Open with the headline: what happened, in one clear sentence with the key number.
- Then the diagnosis — which layer, and how you know.
- The recommendation must name a specific change with a specific target. Not "scale the database" — "increase PG pool_size to 20." Not "optimize Redis" — "raise TTL from 60s to 300s for search results."
- Reference numbers to back up your claim, then say what they *mean*. Don't just restate them.
- If no bottleneck exists (no errors, low latency), say so clearly and suggest nothing.
- Avoid repeating the same advice across runs. Each run's recommendation should differ based on *that run's specific bottleneck*.

Respond as JSON:
{
  "why": "1-3 sentences. First sentence: the headline with the defining number. Then the diagnosis with evidence.",
  "recommendation": "1-3 sentences. A specific, actionable change with a concrete target value. Name the exact config or code change."
}

No markdown fences, no text outside the JSON."""


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
