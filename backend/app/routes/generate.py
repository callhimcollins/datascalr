import json
import os

import httpx
from fastapi import APIRouter, HTTPException

from ..schemas import GenerateConfigRequest, GenerateConfigResponse, Profile
from ..supabase_client import insert

router = APIRouter()

TARGET_API_URL = os.environ.get("TARGET_API_URL", "http://localhost:8001")

SYSTEM_PROMPT = f"""You are a configuration generator for a load-testing platform called DataScalr.

The user describes a platform or API in natural language. You MUST generate 3 load-test profile options targeting our reference API at `{TARGET_API_URL}`.

This reference API has 3 endpoints that each accept `?cached=true/false`:
1. `GET /api/items?cached=` — List items (simple PG query, ~10ms uncached)
2. `GET /api/items/search?q=:term&cached=` — Full-text search (~30-100ms uncached, slowest endpoint)
3. `GET /api/items/stats?cached=` — Category aggregation (~20-60ms uncached)

Return ONLY valid JSON with this structure:
{{
  "base_url": "{TARGET_API_URL}",
  "profiles": [
    {{
      "label": "Feed reads",
      "description": "Simulates scrolling through a timeline with frequent cached reads and occasional fresh fetches. Best for social/feed APIs.",
      "endpoints": [
        {{
          "method": "GET",
          "path": "/api/items?cached=true",
          "description": "List items via Redis cache for fast timeline renders",
          "weight": 0.8
        }},
        {{
          "method": "GET",
          "path": "/api/items?cached=false",
          "description": "List items directly from PostgreSQL for hard refresh",
          "weight": 0.2
        }}
      ]
    }}
  ]
}}

Rules:
- `base_url` MUST be `{TARGET_API_URL}`. Never change this.
- Generate exactly 3 profiles. Each profile must target a DIFFERENT primary path (items, search, or stats — assign one per profile).
- Each profile has exactly 2 endpoints: one cached variant and one uncached variant of the SAME path.
- The `:term` in search paths is a placeholder — the engine replaces it with random keywords.
- The user's platform description determines the WEIGHT distribution within each profile:
  - Real-time / social / chat / feed: heavier on cached (70-90%), lighter on uncached
  - Ecommerce / marketplace: balanced (50-70% cached)
  - Analytics / dashboard / reporting: moderate cache (60-80% cached)
  - API gateway / microservice / backend: evenly distributed
  - Adjust weights based on the user's specific description.
- Weights within each profile MUST sum to 1.0.
- Write a descriptive `label` (2-4 words) and `description` (1-2 sentences) for each profile that explains what it simulates and why it fits.
- Update each endpoint `description` to explain why the weight fits the user's platform context.
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
        if not isinstance(data.get("profiles"), list):
            raise ValueError("missing profiles array")

        profiles = [Profile(**p) for p in data["profiles"]]
        parent = await insert("simulation_parents", {
            "label": req.platform,
            "platform": req.platform,
            "profiles": [p.model_dump() for p in profiles],
            "base_url": TARGET_API_URL,
        })

        return GenerateConfigResponse(
            parent_id=parent["id"],
            base_url=TARGET_API_URL,
            profiles=profiles,
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
