import json
import os

import httpx
from fastapi import APIRouter, HTTPException

from ..schemas import EndpointConfig, GenerateConfigRequest, GenerateConfigResponse

router = APIRouter()

SYSTEM_PROMPT = """You are a configuration generator for a load-testing platform called DataScalr.

The user describes a platform or API in natural language. You MUST generate a load-test config that targets our reference API at `http://localhost:8001`.

This reference API has 3 endpoints that each accept `?cached=true/false`:
1. `GET /api/items?cached=` — List items (simple PG query, ~10ms uncached)
2. `GET /api/items/search?q=:term&cached=` — Full-text search (~30-100ms uncached, slowest endpoint)
3. `GET /api/items/stats?cached=` — Category aggregation (~20-60ms uncached)

Return ONLY valid JSON with this structure:
{
  "base_url": "http://localhost:8001",
  "endpoints": [
    {
      "method": "GET",
      "path": "/api/items/search?q=:term&cached=true",
      "description": "Search items with Redis caching",
      "weight": 0.25
    },
    {
      "method": "GET",
      "path": "/api/items/search?q=:term&cached=false",
      "description": "Search items directly from PostgreSQL",
      "weight": 0.15
    },
    {
      "method": "GET",
      "path": "/api/items?cached=true",
      "description": "List items with Redis caching",
      "weight": 0.25
    },
    {
      "method": "GET",
      "path": "/api/items?cached=false",
      "description": "List items directly from PostgreSQL",
      "weight": 0.15
    },
    {
      "method": "GET",
      "path": "/api/items/stats?cached=true",
      "description": "Category stats with Redis caching",
      "weight": 0.15
    },
    {
      "method": "GET",
      "path": "/api/items/stats?cached=false",
      "description": "Category stats directly from PostgreSQL",
      "weight": 0.05
    }
  ]
}

Rules:
- `base_url` MUST be `http://localhost:8001`. Never change this.
- Generate endpoints for ALL 3 paths (items, search, stats), each with a cached and uncached variant. Total of 6 endpoints.
- The `:term` in search paths is a placeholder — the engine replaces it with random keywords.
- The user's platform description determines the WEIGHT distribution:
  - Real-time / social / chat / feed: heavier on cached search (feed reading habits) and cached list
  - Ecommerce / marketplace: balanced across all 3, with more uncached stats (inventory checks)
  - Analytics / dashboard / reporting: heavy on stats (both cached and uncached), lighter on search
  - API gateway / microservice / backend: evenly distributed, more cached than uncached
- Weights across all 6 endpoints MUST sum to 1.0.
- Update each `description` field to reflect why the weight fits the user's platform.
- Do NOT include `body_template` — these are all GET requests.
- Do not include markdown code fences or any text outside the JSON."""


@router.post("/api/generate-config", response_model=GenerateConfigResponse)
async def generate_config(req: GenerateConfigRequest):
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="DEEPSEEK_API_KEY not configured on the server",
        )

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
                            "content": f"Generate a load-test configuration for this API:\n\n{req.platform}",
                        },
                    ],
                    "max_tokens": 1024,
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
        if not isinstance(data.get("endpoints"), list):
            raise ValueError("missing endpoints array")

        return GenerateConfigResponse(
            base_url=data["base_url"],
            endpoints=[EndpointConfig(**ep) for ep in data["endpoints"]],
        )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned invalid JSON. Try rephrasing your API description.",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate config: {e}",
        )
