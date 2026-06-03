"""Tests for the comparison logic — cache and rate limiting results."""

from app.metrics.comparison import compute_comparison


def _make_metrics(count: int, overrides: dict | None = None) -> list[dict]:
    """Generate metrics buckets with sensible defaults."""
    overrides = overrides or {}
    metrics = []
    for t in range(1, count + 1):
        m = {
            "t": t,
            "cacheHit": 5.0,
            "noCache": 10.0,
            "cachePct": 0.0,
            "noCachePct": 0.0,
            "cacheCount": 10,
            "noCacheCount": 10,
            "cacheRps": 10,
            "noCacheRps": 10,
            "totalRps": 20,
            "rateLimited": 0,
            "rateLimitedPct": 0.0,
            "rateLimitedVus": 0,
        }
        m.update(overrides.get(1, {}))
        metrics.append(m)
    return metrics


def test_cache_comparison_basic():
    """Cache comparison shows cache as winner when cache is faster."""
    metrics = _make_metrics(5)
    config = {"ramp_up": 0}
    result = compute_comparison(metrics, config)

    assert result["avg_cache_ms"] == 5.0
    assert result["avg_no_cache_ms"] == 10.0
    c = result["comparison"]
    assert c is not None
    assert c["winner"] == "cache"
    assert c["cache_ms"] == 5.0
    assert c["no_cache_ms"] == 10.0


def test_cache_comparison_no_cache_wins():
    """No-cache wins when it's faster than cache."""
    metrics = _make_metrics(5, overrides={1: {"cacheHit": 20.0, "noCache": 5.0}})
    config = {"ramp_up": 0}
    result = compute_comparison(metrics, config)

    assert result["comparison"]["winner"] == "no_cache"


def test_cache_comparison_tie():
    """Equal latency results in a tie."""
    metrics = _make_metrics(3, overrides={1: {"cacheHit": 10.0, "noCache": 10.0}})
    config = {"ramp_up": 0}
    result = compute_comparison(metrics, config)

    assert result["comparison"]["winner"] == "tie"


def test_rate_limiting_comparison():
    """Rate limiting mode computes correct avg RPS and rate-limited %."""
    metrics = [
        {"t": 1, "totalRps": 50, "rateLimited": 25, "rateLimitedPct": 50.0},
        {"t": 2, "totalRps": 60, "rateLimited": 30, "rateLimitedPct": 50.0},
        {"t": 3, "totalRps": 40, "rateLimited": 10, "rateLimitedPct": 25.0},
        {"t": 4, "totalRps": 50, "rateLimited": 20, "rateLimitedPct": 40.0},
    ]
    for m in metrics:
        m.update({"cacheHit": 5.0, "noCache": 10.0, "cachePct": 0.0, "noCachePct": 0.0,
                  "cacheCount": 10, "noCacheCount": 10, "cacheRps": 10, "noCacheRps": 10,
                  "rateLimitedVus": 0})

    config = {"ramp_up": 0, "mode": "rate_limiting", "rate_limit_rps": 10}
    result = compute_comparison(metrics, config)

    assert result["avg_rps"] == 50.0  # (50+60+40+50)/4
    assert result["peak_rps"] == 60
    c = result["comparison"]
    assert c["mode"] == "rate_limiting"
    assert c["avg_rps"] == 50.0
    assert c["total_rate_limited"] == 85
    assert c["total_passed"] == 200


def test_rate_limiting_comparison_ramp_up():
    """Ramp-up seconds are excluded from steady-state calculation."""
    metrics = [
        {"t": 1, "totalRps": 100, "rateLimited": 50, "rateLimitedPct": 50.0},
        {"t": 2, "totalRps": 100, "rateLimited": 50, "rateLimitedPct": 50.0},
        {"t": 3, "totalRps": 50, "rateLimited": 10, "rateLimitedPct": 20.0},
        {"t": 4, "totalRps": 50, "rateLimited": 10, "rateLimitedPct": 20.0},
        {"t": 5, "totalRps": 50, "rateLimited": 10, "rateLimitedPct": 20.0},
        {"t": 6, "totalRps": 50, "rateLimited": 10, "rateLimitedPct": 20.0},
    ]
    for m in metrics:
        m.update({"cacheHit": 5.0, "noCache": 10.0, "cachePct": 0.0, "noCachePct": 0.0,
                  "cacheCount": 10, "noCacheCount": 10, "cacheRps": 10, "noCacheRps": 10,
                  "rateLimitedVus": 0})

    config = {"ramp_up": 2, "mode": "rate_limiting", "rate_limit_rps": 10}
    result = compute_comparison(metrics, config)

    c = result["comparison"]
    assert c["avg_rps"] == 50.0
    assert c["avg_rl_pct"] == 20.0


def test_no_steady_state():
    """With no steady-state data, returns zeros and null comparison."""
    metrics = _make_metrics(2)
    config = {"ramp_up": 5, "mode": "rate_limiting", "rate_limit_rps": 10}
    result = compute_comparison(metrics, config)

    assert result["avg_rps"] == 0
    assert result["comparison"] is None


def test_empty_metrics():
    """Empty metrics returns default values."""
    config = {"ramp_up": 0, "mode": "cache_comparison"}
    result = compute_comparison([], config)

    assert result["avg_cache_ms"] == 0.0
    assert result["comparison"] is None
