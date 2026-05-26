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
    cp = bucket.get("cachePct")
    np = bucket.get("noCachePct")

    if t == 1:
        events.append({
            "level": "info",
            "chart": "latency",
            "msg": f"Simulation running — {config['concurrency']} virtual users will ramp up over {config['ramp_up']}s.",
        })

    if config.get("ramp_up") and t == config["ramp_up"]:
        events.append({
            "level": "info",
            "chart": "latency",
            "msg": f"All {config['concurrency']} users are now live. Watching how the system handles the full load.",
        })

    # --- Cache expiry storm ---
    if t > 2 and mr is not None and mr > 80 and not state.get("storm_fired"):
        events.append({
            "level": "warn",
            "chart": "latency",
            "msg": f"Cache miss rate at {mr:.0f}%. Redis TTL (10s) expired on most keys — cached requests hitting PostgreSQL directly until Redis repopulates. Expect periodic repeats every ~10s as TTL cycles.",
        })
        state["storm_fired"] = True
        state["storm_recovered"] = False

    # --- Cache recovery ---
    if mr is not None and mr < 30 and state.get("storm_fired") and not state.get("storm_recovered"):
        events.append({
            "level": "info",
            "chart": "latency",
            "msg": f"Cache miss rate back to {mr:.0f}% — Redis TTL storm subsided, keys repopulated.",
        })
        state["storm_recovered"] = True
        state["storm_fired"] = False

    # --- Redis saturation ---
    if t > 5 and cv is not None:
        cache_rps = bucket.get("cacheRps", 0)
        last_redis_level = state.get("redis_level", "normal")
        recent_cache = [h["cacheHit"] for h in history[-5:] if h.get("cacheHit") is not None]

        if cache_rps > 50 and cv > 20 and len(recent_cache) >= 3 and last_redis_level != "saturated":
            avg_recent_cache = sum(recent_cache) / len(recent_cache)
            if avg_recent_cache > 15 and cv > avg_recent_cache * 1.3:
                events.append({
                    "level": "warn",
                    "chart": "latency",
                    "msg": f"Redis under strain — {cache_rps} req/s at {cv:.0f}ms. Cache is struggling to keep up with the request volume. Probable cause: single-threaded Redis event loop saturated by concurrent operations.",
                })
                state["redis_level"] = "saturated"
        elif cv < 8 and cache_rps < 30 and last_redis_level != "normal":
            events.append({
                "level": "info",
                "chart": "latency",
                "msg": f"Redis recovered — cache hit latency back to {cv:.0f}ms under normal load.",
            })
            state["redis_level"] = "normal"

    # --- PG degradation ---
    if t > 7 and nv is not None:
        recent = [h["noCache"] for h in history[-5:] if h.get("noCache") is not None]
        if len(recent) >= 3:
            avg_recent = sum(recent) / len(recent)
            last_pg_level = state.get("pg_level", "normal")
            pg_errors = [h.get("noCachePct", 0) or 0 for h in history[-5:] if h.get("noCachePct") is not None]

            if nv > 100 and last_pg_level != "critical":
                pg_pool = config.get("pg_pool_size", 4)
                msg = (
                    f"PostgreSQL pool under heavy load — uncached queries at {nv:.0f}ms. "
                    f"The connection pool (max_size={pg_pool}) is fully occupied; requests are queuing."
                )
                if any(e > 0 for e in pg_errors):
                    msg += f" {sum(1 for e in pg_errors if e > 0)} of the last 5 ticks have timeouts — PG cannot keep up with demand. Consider increasing pool size or adding read replicas."
                events.append({"level": "error", "chart": "errors", "msg": msg})
                state["pg_level"] = "critical"
            elif nv > avg_recent * 1.5 and nv > 60 and last_pg_level == "normal":
                events.append({
                    "level": "warn",
                    "chart": "latency",
                    "msg": f"PostgreSQL slowing down — uncached queries now taking {nv:.0f}ms ({int(nv/avg_recent*100-100)}% above recent average). Probable cause: PG connection pool contention or slow queries under concurrent load.",
                })
                state["pg_level"] = "degraded"
            elif nv < 30 and last_pg_level != "normal":
                events.append({
                    "level": "info",
                    "chart": "latency",
                    "msg": f"PostgreSQL back to normal — uncached queries at {nv:.0f}ms.",
                })
                state["pg_level"] = "normal"

    # --- httpx connection pool saturation ---
    total_rps = cc + nc
    if t > 5 and total_rps > 0 and cv is not None and nv is not None:
        last_httpx_level = state.get("httpx_level", "normal")
        both_degraded = cv > 200 and nv > 200
        throttled = total_rps < config.get("concurrency", 0) * 0.3
        if both_degraded and throttled and last_httpx_level != "saturated":
            events.append({
                "level": "warn",
                "chart": "latency",
                "msg": f"Both cache ({cv:.0f}ms) and no-cache ({nv:.0f}ms) are slow with only {total_rps} req/s — httpx connection pool (max 1000) may be saturated. Virtual users are waiting for HTTP connections, creating a system-wide bottleneck.",
            })
            state["httpx_level"] = "saturated"
        elif not both_degraded and last_httpx_level == "saturated":
            events.append({
                "level": "info",
                "chart": "latency",
                "msg": f"httpx pool contention resolved — {total_rps} req/s throughput recovered.",
            })
            state["httpx_level"] = "normal"

    # --- Saturation — near-zero throughput ---
    if cc == 0 and nc == 0 and t > 1 and not state.get("saturation_fired"):
        events.append({
            "level": "error",
            "chart": "errors",
            "msg": "Zero requests completed this second — the system is fully saturated. Probable cause: event loop overloaded with virtual user coroutines, or target API unresponsive.",
        })
        state["saturation_fired"] = True

    # --- Throughput drop ---
    if t > 3 and prev is not None:
        prev_total = (prev.get("cacheCount", 0) or 0) + (prev.get("noCacheCount", 0) or 0)
        if prev_total > 20 and total_rps < prev_total * 0.3 and total_rps < 20 and not state.get("drop_fired"):
            events.append({
                "level": "warn",
                "chart": "latency",
                "msg": f"Throughput collapsed from {prev_total} req/s to {total_rps} req/s — a subsystem is likely timing out or queueing requests. Check PG connection pool and httpx pool limits.",
            })
            state["drop_fired"] = True
        elif total_rps > prev_total * 0.8 and state.get("drop_fired"):
            state["drop_fired"] = False

    # --- Error rates with probable cause ---
    for key, label, is_cached in [
        ("cachePct", "Cached", True),
        ("noCachePct", "Uncached", False),
    ]:
        val = bucket.get(key)
        if val is not None and val > 0:
            last_err = state.get(f"err_{key}", 0)
            if val > last_err and val - last_err >= 5:
                cause = ""
                if is_cached and cv is not None and cv > 1000:
                    cause = " Probable cause: httpx connection pool wait times exceed the 10s timeout — VUs cannot acquire HTTP connections."
                elif not is_cached and nv is not None and nv > 1000:
                    cause = " Probable cause: PostgreSQL connection pool (max_size=4) cannot serve all concurrent queries, causing query timeouts."
                elif not is_cached and mr is not None and mr > 50:
                    cause = " Probable cause: cache misses flooding PostgreSQL with requests, overwhelming the connection pool."
                else:
                    cause = " Requests are exceeding the 10s timeout under the current load."
                events.append({
                    "level": "error",
                    "chart": "errors",
                    "msg": f"{label} error rate at {val:.0f}% — {val:.0f}% of requests are timing out.{cause}",
                })
            state[f"err_{key}"] = val

    return events
