from __future__ import annotations

import json
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

SYSTEM_PROMPT = """You are a load-testing analyst. You will receive metrics from a simulation run that compared cached vs uncached latency.

Your job: explain WHY one was faster and WHAT to do about it. Be specific — reference the actual numbers. No generic advice.

Write your response as a single JSON object with two fields:
{
  "why": "1-3 sentence explanation of what the data shows and why it happened. Reference specific numbers from the metrics.",
  "recommendation": "1-3 sentence actionable recommendation. What would an engineer change based on this run?"
}

Rules:
- Be conversational and direct. Use "cache" and "no-cache" terminology.
- If cache won: cite Redis efficiency vs PostgreSQL pool limits or query speed.
- If no-cache won: cite Redis saturation, uneven weight distribution, or TTL expiry storms.
- If both errored: cite httpx connection pool saturation as the bottleneck.
- Reference specific numbers: avg latencies, max latencies, miss rate, error rates, throughput.
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
                                "winner": req.winner,
                                "faster_pct": round(req.percentage_faster, 1),
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
        return {"why": data.get("why", ""), "recommendation": data.get("recommendation", "")}

    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {e}")
