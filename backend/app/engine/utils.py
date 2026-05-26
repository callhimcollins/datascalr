from __future__ import annotations

import random
from typing import Any


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


def pick_endpoint(endpoints: list[dict]) -> dict:
    """Weighted random selection from the endpoint list."""
    if not endpoints:
        return {"method": "GET", "path": "/", "weight": 1}
    weights = [e.get("weight", 1) for e in endpoints]
    return random.choices(endpoints, weights=weights, k=1)[0]


def build_url(base_url: str, endpoint: dict) -> str:
    """Build the full URL, substituting path params like :id with random values."""
    path = endpoint["path"]
    # Replace :param placeholders with random ints
    parts = path.split("/")
    for i, part in enumerate(parts):
        if part.startswith(":"):
            parts[i] = str(random.randint(1, 10000))
    path = "/".join(parts)
    # Replace :param in query string
    if "?" in path:
        base_path, qs = path.split("?", 1)
        params = qs.split("&")
        for j, param in enumerate(params):
            if "=" in param:
                key, val = param.split("=", 1)
                if val.startswith(":q"):
                    is_cached = "cached=true" in path
                    words = ["electronics", "home", "sports", "books"] if is_cached else ["clothing", "kitchen", "premium", "garden"]
                    params[j] = f"{key}={random.choice(words)}"
                elif val.startswith(":"):
                    params[j] = f"{key}={random.randint(1, 10000)}"
        path = f"{base_path}?{'&'.join(params)}"
    # Ensure no double slashes
    base = base_url.rstrip("/")
    path = path.lstrip("/")
    return f"{base}/{path}"


def build_body(template: dict | None) -> dict | None:
    """Fill a body template with random values."""
    if template is None:
        return None
    body: dict[str, Any] = {}
    for key, val in template.items():
        if isinstance(val, str):
            if val.startswith("$random_int"):
                parts = val.split("_")
                lo, hi = int(parts[2]), int(parts[3])
                body[key] = random.randint(lo, hi)
            elif val.startswith("$random_str"):
                body[key] = "".join(random.choices("abcdefghijklmnopqrstuvwxyz", k=8))
            elif val.startswith("$random_bool"):
                body[key] = random.choice([True, False])
            elif val.startswith("$random_float"):
                parts = val.split("_")
                lo, hi = float(parts[2]), float(parts[3])
                body[key] = round(random.uniform(lo, hi), 2)
            else:
                body[key] = f"{val}_{random.randint(1, 999)}"
        elif isinstance(val, (int, float, bool)):
            body[key] = val
        else:
            body[key] = val
    return body
