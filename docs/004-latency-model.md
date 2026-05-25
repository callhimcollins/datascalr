# 004 — Latency Model (Cache vs No Cache)

## Overview

When a simulation runs, the backend streams one latency data point per second over SSE. Each point contains two values — cache and no-cache — representing the request latency under each mode. The goal is to model realistic behavior where both values are correlated by shared server load.

## Model Structure

Every tick (1 second), the simulation computes:

```
latency_cache    = base_latency + fast_storage
latency_no_cache = base_latency + slow_storage
```

### Shared Base Latency

`base_latency` represents the time the server spends on request processing independent of data storage: routing, auth, serialization, queue wait, CPU contention. This value is **shared** between cache and no-cache, so both lines move together.

The base latency evolves as a **random walk**:

```
target = 3.0 + load_factor * (concurrency * 0.15)

base += (target - base) * random(0.1, 0.4)   # drift toward target
base += gauss(0, 1.5)                         # small jitter
```

- `load_factor` ramps linearly from 0 to 1 over the ramp-up period
- The random walk means adjacent seconds are correlated (no unnatural jumping)
- Occasional load spikes (`~8-25ms`, 8% probability per tick) simulate GC pauses or queue buildup

### Storage Overhead

Added on top of the base:

| Mode      | Source                  | Typical Latency | Variance          |
|-----------|-------------------------|----------------|--------------------|
| Cache     | In-memory read          | ~3 ms          | Very low (stable)  |
| No Cache  | Database / external I/O | ~80 ms         | Higher (query complexity, disk, network) |

The storage delta is roughly constant (~77 ms), so the gap between the two lines is stable. This mirrors real behavior where cache reduces only the data-fetch portion of total latency.

### Concurrency Effects

As concurrency increases, the target base latency grows linearly:

```
target = 3.0 + load_factor * (concurrency * 0.15)
```

This models queueing: more in-flight requests means longer wait times before processing starts, affecting cache and no-cache equally. However, real systems saturate non-linearly — the model will be updated to reflect exponential growth past a concurrency threshold.

## Why Shared Base Matters

If cache and no-cache were generated independently, a no-cache spike without a corresponding cache spike would imply the database got slower while the server stayed fast — a scenario that doesn't happen in practice. Under real load, both see the same server conditions; only the storage layer differs.

## Current Limitations

- No actual HTTP requests are made to a target — values are simulated
- Storage latencies are fixed distributions, not measured from a real data store
- Concurrency scaling is linear; real servers hit a saturation cliff
