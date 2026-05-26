from __future__ import annotations


def analyze(
    t: int,
    bucket: dict,
    config: dict,
    history: list[dict],
    state: dict,
) -> list[dict]:
    """Generate conversational notifications about significant system events."""
    events: list[dict] = []
    prev = history[-1] if history else None
    cc = bucket.get("cacheCount", 0)
    nc = bucket.get("noCacheCount", 0)
    cv = bucket.get("cacheHit")
    nv = bucket.get("noCache")
    mr = bucket.get("cacheMissRate")

    if t == 1:
        events.append({
            "level": "info",
            "msg": f"Simulation running — {config['concurrency']} virtual users will ramp up over {config['ramp_up']}s.",
        })

    if config.get("ramp_up") and t == config["ramp_up"]:
        events.append({
            "level": "info",
            "msg": f"All {config['concurrency']} users are now live. Watching how the system handles the full load.",
        })

    # Cache expiry storm — high miss rate = all cached requests hitting PG
    if t > 2 and mr is not None and mr > 80 and not state.get("storm_fired"):
        events.append({
            "level": "warn",
            "msg": f"Cache miss rate at {mr:.0f}% — cached requests hitting PostgreSQL directly until Redis repopulates.",
        })
        state["storm_fired"] = True
        state["storm_recovered"] = False

    # Cache recovery — miss rate dropped back down
    if mr is not None and mr < 30 and state.get("storm_fired") and not state.get("storm_recovered"):
        events.append({
            "level": "info",
            "msg": f"Cache miss rate back to {mr:.0f}% — Redis is serving HITs again.",
        })
        state["storm_recovered"] = True
        state["storm_fired"] = False

    # Redis saturation — cache hit latency climbing under high volume
    if t > 5 and cv is not None:
        cache_rps = bucket.get("cacheRps", 0)
        last_redis_level = state.get("redis_level", "normal")
        recent_cache = [h["cacheHit"] for h in history[-5:] if h.get("cacheHit") is not None]

        if cache_rps > 50 and cv > 20 and len(recent_cache) >= 3 and last_redis_level != "saturated":
            avg_recent_cache = sum(recent_cache) / len(recent_cache)
            if avg_recent_cache > 15 and cv > avg_recent_cache * 1.3:
                events.append({
                    "level": "warn",
                    "msg": f"Redis under strain — {cache_rps} req/s at {cv:.0f}ms. Cache is struggling to keep up with the request volume.",
                })
                state["redis_level"] = "saturated"
        elif cv < 8 and cache_rps < 30 and last_redis_level != "normal":
            events.append({
                "level": "info",
                "msg": f"Redis recovered — cache hit latency back to {cv:.0f}ms under normal load.",
            })
            state["redis_level"] = "normal"

    # PG degradation — uncached latency trends upward
    if t > 7 and nv is not None:
        recent = [h["noCache"] for h in history[-5:] if h.get("noCache") is not None]
        if len(recent) >= 3:
            avg_recent = sum(recent) / len(recent)
            last_pg_level = state.get("pg_level", "normal")

            if nv > 100 and last_pg_level != "critical":
                events.append({
                    "level": "error",
                    "msg": f"PostgreSQL pool under heavy load — uncached queries at {nv:.0f}ms. The pool is likely fully occupied with requests queuing.",
                })
                state["pg_level"] = "critical"
            elif nv > avg_recent * 1.5 and nv > 60 and last_pg_level == "normal":
                events.append({
                    "level": "warn",
                    "msg": f"PostgreSQL is slowing down — uncached queries now taking {nv:.0f}ms ({int(nv/avg_recent*100-100)}% above the recent average).",
                })
                state["pg_level"] = "degraded"
            elif nv < 30 and last_pg_level != "normal":
                events.append({
                    "level": "info",
                    "msg": f"PostgreSQL back to normal — uncached queries at {nv:.0f}ms.",
                })
                state["pg_level"] = "normal"

    # Saturation — zero requests completed
    if cc == 0 and nc == 0 and t > 1 and not state.get("saturation_fired"):
        events.append({
            "level": "error",
            "msg": "Zero requests completed this second — the system appears to be fully saturated and unable to keep up.",
        })
        state["saturation_fired"] = True

    # Errors
    for key, label in [("cachePct", "Cached endpoints"), ("noCachePct", "Uncached endpoints")]:
        val = bucket.get(key)
        if val is not None and val > 0:
            last_err = state.get(f"err_{key}", 0)
            if val > last_err and val - last_err >= 5:
                events.append({
                    "level": "error",
                    "msg": f"{label} error rate at {val:.0f}% — requests are failing under the current load.",
                })
            state[f"err_{key}"] = val

    return events
