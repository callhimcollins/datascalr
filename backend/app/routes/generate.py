import json
import os

import httpx
from fastapi import APIRouter, HTTPException

from ..schemas import EndpointConfig, GenerateConfigRequest, GenerateConfigResponse

router = APIRouter()

SYSTEM_PROMPT = """You are a configuration generator for a load-testing platform called DataScalr.

The user describes a REST API in natural language. Extract the base URL and each endpoint they describe.

Return ONLY valid JSON with this structure:
{
  "base_url": "api.datascalr.com/twitter",
  "endpoints": [
    {
      "method": "GET",
      "path": "/tweets",
      "description": "List all tasks",
      "weight": 0.4
    }
  ]
}

Rules:
- Use `api.datascalr.com/<service-name>` as the base URL (e.g. `api.datascalr.com/twitter`, `api.datascalr.com/task-manager`). Never use real domains.
- Each `method` must be one of GET, POST, PUT, PATCH, DELETE.
- `path` is the URL path WITH path parameters (e.g. /tweets/:id).
- `weight` is the proportion of traffic for this endpoint (0.0 to 1.0). All weights should sum to 1.0. Distribute weights based on how heavily the endpoint is typically used — listing/reading should generally get higher weight than creating or deleting.
- If the user mentions a request body, include a `body_template` object with example fields and placeholder values (strings for text fields, numbers for numeric fields, booleans for flags).
- Aim for 3-6 endpoints if the description gives enough context. If the user only describes one or two, just return those.
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
