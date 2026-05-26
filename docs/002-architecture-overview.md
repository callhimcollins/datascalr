# 002 — Architecture Overview

## High-Level Data Flow

```
Frontend (Next.js)          DataScalr Backend (FastAPI)         Target API (Docker)
┌─────────────────┐        ┌──────────────────────────────┐   ┌──────────────────────┐
│  Configure Page  │──────→│  POST /api/runs  (create)   │   │  FastAPI             │
│                  │        │       ↓                      │   │                      │
│  Simulate Page   │←──────│  Engine spawns VUs           │──▶│  GET /api/items     │
│  (SSE + charts)  │   SSE  │  (asyncio httpx tasks)      │   │  ?cached=true/false  │
│                  │        │       ↓                      │   └────────┬─────┬──────┘
│  Supabase (read) │◀──────│  MetricsCollector            │            │     │
│  run history     │  REST  │       ↓                      │   ┌────────▼─────▼──────┐
└─────────────────┘        │  Supabase (persist)          │   │  PostgreSQL   Redis  │
                           └──────────────────────────────┘   │  (Docker)    (Docker)│
                                                              └──────────────────────┘
```

## Tiers

### Tier 1: Target Infrastructure (Docker Compose)

Three services defined in `docker-compose.yml`:

- **PostgreSQL 16** — the target API's database. Contains a single `items` table seeded with 10,000 realistic JSON rows (id, name, data, created_at). This is what virtual users indirectly query during a simulation.
- **Redis 7** — the target API's cache layer. Stores serialized query results with a TTL. Demonstrates the latency difference between cache hits and direct database queries.
- **Target API** — a FastAPI reference app with a single endpoint `GET /api/items`. Accepts a `cached` query parameter:
  - `?cached=true` — checks Redis. On hit, returns immediately (~1ms). On miss, queries PostgreSQL, caches result in Redis with TTL, returns (~20ms). Sets `X-Cache: HIT` or `X-Cache: MISS` response header.
  - `?cached=false` — queries PostgreSQL directly every time (~20-80ms). Under load, PG connection pool contention causes real latency spikes, timeouts, and errors.

The target API uses `asyncpg` with a connection pool (min_size=4, max_size=20). The pool size is the bottleneck that makes the uncached path degrade realistically under high concurrency.

### Tier 2: DataScalr Engine (host)

Runs as asyncio tasks inside the FastAPI process on the host machine (hot-reload enabled).

#### Runner (engine/runner.py)

Receives a run config and orchestrates the entire simulation:

1. Creates a shared `httpx.AsyncClient` with `max_connections=1000`
2. Creates a `MetricsCollector` instance that all VUs share
3. Spawns virtual user tasks, staggering their start times evenly across the ramp-up period
4. Blocks until the stop event fires (run duration expires or client disconnects)
5. Cancels all VU tasks and finalizes the run

#### Virtual User (engine/virtual_user.py)

Each VU is an infinite coroutine loop:

```
loop:
    pick endpoint from config by weight          # weighted random selection
    fire HTTP request via httpx.AsyncClient       # real network I/O
    record: latency, status_code, error           # real measurements
    report sample to MetricsCollector             # thread-safe buffer append
    sleep for think_time                          # normally-distributed around base
```

Think time is estimated from the platform type (same logic as the old mock: social=2s, ecommerce=3.5s, api=1s, etc.) with gaussian jitter applied per-VU.

Error taxonomy (all real):
- **TimeoutException** — request exceeded 10-second timeout
- **ConnectError** — connection refused or DNS failure
- **RemoteProtocolError** — connection reset mid-request
- **Non-2xx HTTP status** — 4xx/5xx application-level errors

### Tier 3: Metrics Collector (metrics/collector.py)

Receives raw `Sample` objects from all VUs and aggregates them:

1. Samples are appended to a shared buffer via `add_sample()` — a lightweight, lock-free operation in asyncio
2. Every second, the SSE handler calls `compute_bucket(t)`:
   - Atomically swaps the buffer (old list → new empty list)
   - Splits samples into cached / uncached groups by URL path
   - Separates successful requests (used for latency percentiles) from errors
   - Computes p50 latency per group (nearest-rank method)
   - Computes error percentage per group (errors ÷ total × 100)
3. Returns a bucket dict matching the frontend's SSE contract:
   ```json
   {"t": 5, "cache": 2.3, "noCache": 45.1, "cachePct": 0.0, "noCachePct": 8.7}
   ```

### Tier 4: Persistence (Supabase)

After a run completes, the aggregated buckets are saved to Supabase:

- **runs** table — one row per simulation: run_id, config (JSON), status, created_at
- **buckets** table — one row per second per run: run_id, t, cache_latency, no_cache_latency, cache_error_pct, no_cache_error_pct

This is low-volume data (a 60-second run = 60 bucket rows), making it viable within Supabase's free tier.

Supabase is **not** used as the target API's database — the target API uses local Docker PostgreSQL to avoid request costs during high-load simulations.

## Engine State Machine

```
Pending → Running → Completed
               ↘ Cancelled (client disconnect / error)
```

## SSE Contract (unchanged from mock)

The frontend's `useSSE` hook expects events of this shape:

```typescript
{
  t: number;         // second from start
  cache: number;     // p50 latency in ms (cached requests)
  noCache: number;   // p50 latency in ms (uncached requests)
  cachePct: number;  // error % for cached requests
  noCachePct: number; // error % for uncached requests
  done?: boolean;    // present and true when run completes
}
```

## API Routes

| Endpoint | Method | What it does |
|---|---|---|
| `/api/runs` | POST | Create and start a new simulation run |
| `/api/runs` | GET | List all past runs with summaries (from Supabase) |
| `/api/runs/{id}` | GET | Get full details of a specific run |
| `/api/runs/{id}/stream` | GET | SSE stream — pushes real-time bucket data |
| `/api/runs/{id}` | DELETE | Delete a run and its data |
| `/api/generate-config` | POST | AI-generated endpoint configuration (via DeepSeek) |

## Key Design Decisions

1. **Real HTTP requests, not mock math** — every metric comes from an actual network round-trip. The cache vs no-cache comparison is genuine because Redis and PostgreSQL are real services with real resource limits.
2. **Target API in Docker, DataScalr on host** — the engine benefits from hot-reload during development. The infrastructure (PG, Redis, target API) is containerized for repeatability.
3. **Supabase for DataScalr's data, local PG for load testing** — avoids unexpected cloud bills from high-volume database queries during simulations.
4. **SSE over WebSocket** — one-directional (server → client), simpler, auto-reconnects, no library needed. The same contract works for both mock and real data.
5. **Per-second bucketing** — aggregates raw request samples into 1-second buckets. Keeps storage lean (a 5-minute run = 300 buckets) while preserving percentile accuracy.
6. **In-process engine** — VUs run as asyncio tasks inside the FastAPI process. Ceiling ~5k VUs on consumer hardware.

## Directory Layout

```
datascalr/
├── docker-compose.yml
├── target-api/
│   ├── app.py
│   ├── Dockerfile
│   ├── requirements.txt
│   └── init.sql
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── db.py                    # Supabase client
│   │   ├── routes/
│   │   │   ├── runs.py
│   │   │   ├── stream.py
│   │   │   └── generate.py
│   │   ├── schemas/
│   │   ├── engine/
│   │   │   ├── runner.py            # VU orchestrator
│   │   │   ├── virtual_user.py      # Single VU httpx loop
│   │   │   └── utils.py             # Think time, endpoint picker
│   │   └── metrics/
│   │       ├── collector.py         # Sample → bucket aggregation
│   │       └── store.py             # Supabase persistence
│   ├── requirements.txt
│   └── .env
├── frontend/
└── docs/
```
