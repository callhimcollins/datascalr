"""Tests for the metrics collector — sample aggregation and bucketing."""

from app.metrics.collector import MetricsCollector, Sample


def test_empty_bucket():
    """A bucket with no samples returns zeros and nulls."""
    c = MetricsCollector()
    bucket = c.compute_bucket(1)
    assert bucket["t"] == 1
    assert bucket["cacheHit"] is None
    assert bucket["noCache"] is None
    assert bucket["cachePct"] is None
    assert bucket["noCachePct"] is None
    assert bucket["rateLimited"] == 0
    assert bucket["rateLimitedPct"] is None
    assert bucket["totalRps"] == 0


def test_all_ok_requests():
    """Samples with no errors go to the correct buckets."""
    c = MetricsCollector()
    c.add_sample(Sample(latency_ms=5.0, status_code=200, cached=True, cache_hit=True))
    c.add_sample(Sample(latency_ms=10.0, status_code=200, cached=True, cache_hit=True))
    c.add_sample(Sample(latency_ms=15.0, status_code=200, cached=False))

    bucket = c.compute_bucket(1)
    assert bucket["cacheCount"] == 2
    assert bucket["noCacheCount"] == 1
    assert bucket["noCache"] == 15.0  # only one uncached sample
    assert bucket["cacheHit"] == 7.5  # p50 of [5, 10]
    assert bucket["noCachePct"] == 0.0
    assert bucket["totalRps"] == 3


def test_rate_limited_samples():
    """Samples with status 429 are counted as rate-limited, not errors."""
    c = MetricsCollector()
    c.add_sample(Sample(latency_ms=5.0, status_code=429, cached=False, rate_limited=True))
    c.add_sample(Sample(latency_ms=5.0, status_code=429, cached=False, rate_limited=True))
    c.add_sample(Sample(latency_ms=3.0, status_code=200, cached=False))

    bucket = c.compute_bucket(1)
    assert bucket["rateLimited"] == 2
    assert bucket["rateLimitedPct"] == 66.7  # 2/3
    assert bucket["rateLimitedVus"] == 1  # both default to vu_id=0
    assert bucket["noCachePct"] == 0.0  # 429 excluded from error rate
    assert bucket["noCacheCount"] == 3  # all 3 are uncached, 429s have no error set


def test_rate_limited_vus():
    """Distinct VU IDs are counted in rateLimitedVus."""
    c = MetricsCollector()
    c.add_sample(Sample(latency_ms=5.0, status_code=429, cached=False, rate_limited=True, vu_id=0))
    c.add_sample(Sample(latency_ms=5.0, status_code=429, cached=False, rate_limited=True, vu_id=1))
    c.add_sample(Sample(latency_ms=5.0, status_code=429, cached=False, rate_limited=True, vu_id=0))

    bucket = c.compute_bucket(1)
    assert bucket["rateLimited"] == 3
    assert bucket["rateLimitedVus"] == 2  # VUs 0 and 1


def test_http_errors():
    """Non-429 errors are counted in error rates."""
    c = MetricsCollector()
    c.add_sample(Sample(latency_ms=5.0, status_code=500, cached=False, error="http_500"))
    c.add_sample(Sample(latency_ms=3.0, status_code=200, cached=False))
    c.add_sample(Sample(latency_ms=3.0, status_code=200, cached=False))

    bucket = c.compute_bucket(1)
    assert bucket["noCachePct"] == 33.3  # 1/3
    assert bucket["rateLimited"] == 0


def test_cache_hit_miss_tracking():
    """Cache hit vs miss is correctly identified."""
    c = MetricsCollector()
    c.add_sample(Sample(latency_ms=2.0, status_code=200, cached=True, cache_hit=True))
    c.add_sample(Sample(latency_ms=2.0, status_code=200, cached=True, cache_hit=True))
    c.add_sample(Sample(latency_ms=10.0, status_code=200, cached=True, cache_hit=False))

    bucket = c.compute_bucket(1)
    assert bucket["cacheHit"] == 2.0  # p50 of [2, 2]
    assert bucket["cacheMissRate"] == 33.3  # 1/3


def test_multiple_buckets():
    """Multiple compute_bucket calls produce independent buckets."""
    c = MetricsCollector()
    c.add_sample(Sample(latency_ms=5.0, status_code=200, cached=True, cache_hit=True))
    b1 = c.compute_bucket(1)
    assert b1["totalRps"] == 1

    c.add_sample(Sample(latency_ms=10.0, status_code=200, cached=False))
    c.add_sample(Sample(latency_ms=10.0, status_code=200, cached=False))
    b2 = c.compute_bucket(2)
    assert b2["totalRps"] == 2
    assert b1["totalRps"] == 1  # first bucket unchanged


def test_percentiles():
    """P50, P95, P99 are computed correctly."""
    c = MetricsCollector()
    for ms in range(1, 101):  # 1..100 ms
        c.add_sample(Sample(latency_ms=float(ms), status_code=200, cached=True, cache_hit=True))

    bucket = c.compute_bucket(1)
    assert bucket["cacheHit"] == 50.5  # median of 1..100
    assert bucket["cacheHit_p95"] == 96.0  # 0-indexed: sorted_values[95] = 96
    assert bucket["cacheHit_p99"] == 100.0  # sorted_values[99] = 100
