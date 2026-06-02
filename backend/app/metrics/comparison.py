"""Aggregate run result computations — cache comparison and rate limiting."""


def compute_comparison(metrics: list[dict], config: dict) -> dict:
    """Route to the correct comparison function based on test mode."""
    if config.get("mode") == "rate_limiting":
        return _compute_rate_limit_results(metrics, config)

    return _compute_cache_comparison(metrics, config)


def _compute_cache_comparison(metrics: list[dict], config: dict) -> dict:
    cache_vals = [m["cacheHit"] for m in metrics if m.get("cacheHit") is not None]
    no_cache_vals = [m["noCache"] for m in metrics if m.get("noCache") is not None]

    ramp_up = config.get("ramp_up", 0)
    cache_steady = [m["cacheHit"] for m in metrics[ramp_up:] if m.get("cacheHit") is not None]
    no_cache_steady = [m["noCache"] for m in metrics[ramp_up:] if m.get("noCache") is not None]

    avg_cache = round(sum(cache_vals) / len(cache_vals), 1) if cache_vals else 0.0
    avg_no_cache = round(sum(no_cache_vals) / len(no_cache_vals), 1) if no_cache_vals else 0.0
    avg_cache_steady = round(sum(cache_steady) / len(cache_steady), 1) if cache_steady else 0.0
    avg_no_cache_steady = round(sum(no_cache_steady) / len(no_cache_steady), 1) if no_cache_steady else 0.0

    comparison = None
    if avg_cache_steady > 0 and avg_no_cache_steady > 0:
        diff = avg_no_cache_steady - avg_cache_steady
        pct_diff = (diff / avg_no_cache_steady) * 100 if avg_no_cache_steady > 0 else 0
        comparison = {
            "cache_ms": avg_cache_steady,
            "no_cache_ms": avg_no_cache_steady,
            "difference_ms": round(diff, 1),
            "percentage_faster": round(pct_diff, 1),
            "winner": "cache" if diff > 0 else "no_cache" if diff < 0 else "tie",
        }

    return {
        "avg_cache_ms": avg_cache,
        "avg_no_cache_ms": avg_no_cache,
        "avg_cache_steady_ms": avg_cache_steady,
        "avg_no_cache_steady_ms": avg_no_cache_steady,
        "comparison": comparison,
    }


def _compute_rate_limit_results(metrics: list[dict], config: dict) -> dict:
    ramp_up = config.get("ramp_up", 0)
    steady = metrics[ramp_up:] if len(metrics) > ramp_up else []

    if not steady:
        return {
            "avg_rps": 0,
            "avg_throttled_pct": 0,
            "peak_rps": 0,
            "comparison": None,
        }

    rps_vals = [m["totalRps"] for m in steady if m.get("totalRps") is not None]
    rl_pct_vals = [m.get("rateLimitedPct", 0) or 0 for m in steady]
    ceiling = config.get("rate_limit_rps") or 0

    avg_rps = round(sum(rps_vals) / len(rps_vals), 1) if rps_vals else 0
    peak_rps = max(rps_vals) if rps_vals else 0
    avg_rl_pct = round(sum(rl_pct_vals) / len(rl_pct_vals), 1) if rl_pct_vals else 0

    total_rate_limited = sum(m.get("rateLimited", 0) for m in metrics if m.get("rateLimited") is not None)
    total_passed = sum(m.get("totalRps", 0) for m in metrics if m.get("totalRps") is not None)

    comparison = {
        "mode": "rate_limiting",
        "avg_rps": avg_rps,
        "peak_rps": peak_rps,
        "rate_limit_ceiling": ceiling,
        "avg_rl_pct": avg_rl_pct,
        "total_rate_limited": total_rate_limited,
        "total_passed": total_passed,
    }

    return {
        "avg_rps": avg_rps,
        "avg_rl_pct": avg_rl_pct,
        "peak_rps": peak_rps,
        "comparison": comparison,
    }
