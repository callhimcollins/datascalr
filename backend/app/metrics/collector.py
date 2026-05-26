from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class Sample:
    latency_ms: float
    status_code: int
    cached: bool
    error: str | None = None


def _percentile(sorted_values: list[float], p: int) -> float:
    if not sorted_values:
        return 0.0
    if p == 50 and len(sorted_values) % 2 == 0:
        m = len(sorted_values) // 2
        return (sorted_values[m - 1] + sorted_values[m]) / 2
    k = len(sorted_values) * p // 100
    return sorted_values[k]


class MetricsCollector:
    """Thread-safe sample buffer that produces per-second aggregate buckets."""

    def __init__(self) -> None:
        self._samples: list[Sample] = []

    def add_sample(self, sample: Sample) -> None:
        self._samples.append(sample)

    def compute_bucket(self, t: int) -> dict:
        """Swap the sample buffer and compute aggregate stats for the window."""
        bucket, self._samples = self._samples, []

        cached_ok = [s.latency_ms for s in bucket if s.cached and s.error is None]
        uncached_ok = [s.latency_ms for s in bucket if not s.cached and s.error is None]
        cached_err = [s for s in bucket if s.cached and s.error is not None]
        uncached_err = [s for s in bucket if not s.cached and s.error is not None]

        cached_total = len(cached_ok) + len(cached_err)
        uncached_total = len(uncached_ok) + len(uncached_err)

        return {
            "t": t,
            "cache": round(_percentile(cached_ok, 50), 1) if cached_ok else None,
            "noCache": round(_percentile(uncached_ok, 50), 1) if uncached_ok else None,
            "cachePct": round(len(cached_err) / cached_total * 100, 1) if cached_total > 0 else None,
            "noCachePct": round(len(uncached_err) / uncached_total * 100, 1) if uncached_total > 0 else None,
            "cacheCount": len(cached_ok),
            "noCacheCount": len(uncached_ok),
            "cacheRps": cached_total,
            "noCacheRps": uncached_total,
        }
