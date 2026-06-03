"""Tests for the analysis event detectors."""

from app.metrics.analysis import analyze


def _bucket(**overrides) -> dict:
    """Create a metrics bucket with sensible defaults."""
    b = {
        "t": 5,
        "cacheHit": 5.0,
        "cacheHit_p95": 10.0,
        "cacheHit_p99": 15.0,
        "cacheMissRate": 0.0,
        "noCache": 10.0,
        "noCache_p95": 20.0,
        "noCache_p99": 30.0,
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
    b.update(overrides)
    return b


def test_lifecycle_start_event():
    """First tick emits a lifecycle event."""
    events = analyze(1, _bucket(t=1), {"concurrency": 10, "ramp_up": 5}, [], {})
    assert len(events) >= 1
    assert any("virtual users" in e["msg"] for e in events)


def test_lifecycle_ramp_up_complete():
    """Ramp-up complete event fires at the ramp-up second."""
    events = analyze(5, _bucket(t=5), {"concurrency": 10, "ramp_up": 5}, [], {})
    assert any("All 10 users are now live" in e["msg"] for e in events)


def test_cache_storm_detection():
    """Cache miss rate > 80% triggers a storm warning."""
    events = analyze(5, _bucket(t=5, cacheMissRate=85.0), {"concurrency": 10}, [], {})
    assert any("miss rate" in e["msg"] and e["level"] == "warn" for e in events)


def test_cache_storm_fires_once():
    """Cache storm only fires once, not repeatedly."""
    state = {}
    analyze(5, _bucket(t=5, cacheMissRate=90.0), {"concurrency": 10}, [], state)
    # Second call with same condition — should not fire again
    events = analyze(6, _bucket(t=6, cacheMissRate=90.0), {"concurrency": 10}, [], state)
    assert not any("miss rate" in e["msg"] for e in events)


def test_cache_recovery():
    """After a storm, recovery fires when miss rate drops below 30%."""
    state = {"storm_fired": True, "storm_recovered": False}
    events = analyze(5, _bucket(t=5, cacheMissRate=20.0), {"concurrency": 10}, [], state)
    assert any("subsided" in e["msg"] for e in events)
    assert state["storm_recovered"] is True


def test_pg_degradation():
    """No-cache latency > 100ms triggers PG pool warning."""
    events = analyze(10, _bucket(t=10, noCache=120.0, noCachePct=0.0),
                     {"concurrency": 10, "pg_pool_size": 4},
                     [_bucket(t=1, noCache=10.0)] * 5, {})
    assert any("PostgreSQL pool" in e["msg"] for e in events)


def test_saturation_event():
    """Zero requests completed triggers saturation event."""
    events = analyze(3, _bucket(t=3, cacheCount=0, noCacheCount=0),
                     {"concurrency": 10}, [], {})
    assert any("Zero requests" in e["msg"] for e in events)


def test_rate_limiting_active():
    """Rate limiting mode detects high 429 rate."""
    config = {"concurrency": 10, "mode": "rate_limiting", "rate_limit_rps": 5}
    events = analyze(5, _bucket(t=5, rateLimitedPct=55.0, rateLimited=11, totalRps=20,
                                rateLimitedVus=5),
                     config, [], {})
    assert any("rate limit saturated" in e["msg"].lower() for e in events)


def test_rate_limiting_approaching():
    """Moderate 429 rate shows approaching event."""
    config = {"concurrency": 10, "mode": "rate_limiting", "rate_limit_rps": 5}
    events = analyze(5, _bucket(t=5, rateLimitedPct=25.0, rateLimited=5, totalRps=20,
                                rateLimitedVus=3),
                     config, [], {})
    assert any("rate limiting active" in e["msg"].lower() for e in events)


def test_rate_limiting_recovery():
    """After saturation, a window with 0% 429s shows recovery."""
    config = {"concurrency": 10, "mode": "rate_limiting", "rate_limit_rps": 5}
    state = {"rl_level": "saturated", "rl_ceiling_fired": True}
    events = analyze(6, _bucket(t=6, rateLimitedPct=0.0, rateLimited=0, totalRps=20,
                                rateLimitedVus=0),
                     config, [], state)
    assert any("subsided" in e["msg"] for e in events)
    assert state["rl_level"] == "normal"


def test_error_spike_detection():
    """Error rate increase of >=5% triggers error event."""
    state = {}
    events = analyze(5, _bucket(t=5, noCachePct=25.0, noCache=10.0),
                     {"concurrency": 10}, [], state)
    assert any("error rate" in e["msg"] and "Uncached" in e["msg"] for e in events)


def test_no_false_alarm_for_normal_fluctuation():
    """Small error rate changes don't trigger events."""
    state = {"err_noCachePct": 3.0}
    events = analyze(5, _bucket(t=5, noCachePct=5.0), {"concurrency": 10}, [], state)
    # Only 2% increase — below the 5% threshold
    assert not any("error rate" in e["msg"] for e in events)


def test_throughput_collapse():
    """Throughput drop > 70% triggers collapse warning."""
    prev = _bucket(t=4, cacheCount=50, noCacheCount=50)
    events = analyze(5, _bucket(t=5, cacheCount=5, noCacheCount=5),
                     {"concurrency": 100}, [prev], {})
    assert any("collapsed" in e["msg"] for e in events)
