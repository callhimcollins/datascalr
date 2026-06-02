from __future__ import annotations

import asyncio
import time


class TokenBucketRateLimiter:
    """Async token bucket rate limiter shared across virtual users.

    Maintains a token bucket that refills at ``rate`` tokens per second.
    Each ``acquire()`` call consumes one token. When the bucket is empty
    the caller is delayed until a token becomes available — this naturally
    paces the aggregate request rate to the configured ceiling.

    Tracks passed vs throttled counts (resettable per bucket interval) so
    the metrics collector can report what fraction of requests were delayed.
    """

    def __init__(self, rate: float, burst: int | None = None):
        self.rate = rate
        self.burst = burst or int(rate)
        self._tokens = float(self.burst)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()
        self.passed: int = 0
        self.throttled: int = 0

    async def acquire(self) -> bool:
        """Acquire one token, blocking until available.

        Returns ``True`` if the request passed immediately,
        ``False`` if the caller was throttled (had to wait).
        """
        was_throttled = False
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    if was_throttled:
                        self.throttled += 1
                    else:
                        self.passed += 1
                    return not was_throttled

            was_throttled = True
            await asyncio.sleep(max(0.001, 1.0 / self.rate))

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.burst, self._tokens + elapsed * self.rate)
        self._last_refill = now

    def snapshot_metrics(self) -> dict:
        """Return current counters (non-destructive, for display)."""
        return {"passed": self.passed, "throttled": self.throttled}
