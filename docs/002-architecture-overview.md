# 002 — Architecture Overview

## High-Level Data Flow

```
Frontend (Next.js)          Backend (FastAPI)
┌─────────────────┐        ┌──────────────────────────────┐
│  Simulation Form │──────→│ /api/runs  (create run)     │
│                  │        │       ↓                      │
│  Real-time Chart │←──────│  Engine  (asyncio tasks)     │
│     + Logs       │   SSE  │       ↓                      │
│                  │        │  Metrics Collector           │
│  History /       │←──────│       ↓                      │
│  Compare         │  REST  │  Storage (SQLite on disk)   │
└─────────────────┘        └──────────────────────────────┘
```

## Layers — Bottom to Top

### Storage (persistent)

Every simulation run is saved to SQLite so results survive restarts and can be analyzed later (e.g., "did adding that index improve p99 across all runs this week?").

Tables:
- **runs** — one row per simulation: id, config (JSON), status, start/end timestamps
- **metrics_buckets** — one row per second per run: timestamp, count, p50/p95/p99 latency, error count, throughput
- **request_samples** — (optional) raw per-request data for drill-down analysis

SQLite keeps things zero-setup for local use. The storage layer is abstracted behind a `Store` interface so swapping to Postgres later is isolated.

### Metrics Collector

Each virtual user reports every request result (latency in ms, status code, error if any). The collector:

1. Receives raw samples from all running VUs
2. Buckets them by wall-clock second
3. At each second boundary, computes: count, p50/p95/p99, error count
4. Pushes the bucket to the store AND broadcasts it via SSE to the frontend
5. Stores to SQLite after the run completes (or periodically during long runs)

Percentiles are computed from the raw samples in each bucket using the nearest-rank method — efficient for the volume we expect (~thousands per second).

### Engine

The simulation engine orchestrates a single run:

1. **Runner** receives a `RunConfig` (target URL, concurrency, duration, ramp-up time, think time range)
2. It spawns a `TaskGroup` of virtual user coroutines
3. During ramp-up, it staggers their start so users arrive gradually
4. Each VU runs its loop until the run duration expires
5. When the run ends (or is cancelled), the runner cancels all VU tasks and finalizes the run in storage

Engine state machine per run:

```
Pending → Running → Completed
               ↘ Cancelled (user hits stop)
```

### Virtual User

A single virtual user is a coroutine that loops:

```
loop:
    send HTTP request (httpx.AsyncClient)
    record: latency, status, error
    report sample to Metrics Collector
    sleep for random think time (between configured min/max)
```

Each VU has its own `httpx.AsyncClient` (so connection pooling per VU is realistic). All VUs for a run share a single `MetricsCollector` instance via a queue or direct call.

### Schemas (Pydantic)

| Schema | Fields |
|---|---|
| `RunConfig` | target_url, vu_count, duration_secs, ramp_up_secs, think_time_min/max, method, headers, body_template |
| `RunStatus` | id, status, current_vus, elapsed_secs, total_buckets |
| `MetricsBucket` | timestamp, request_count, p50, p95, p99, avg, error_count, rps |
| `RunSummary` | id, config, status, start_time, end_time, summary_stats (overall p50/p95/p99, total requests, error %) |

### API Routes

| Endpoint | Method | What it does |
|---|---|---|
| `/api/runs` | POST | Create and start a new simulation run |
| `/api/runs` | GET | List all past runs with summaries |
| `/api/runs/{id}` | GET | Get full details of a specific run |
| `/api/runs/{id}/stream` | GET | SSE stream — pushes `MetricsBucket` as they arrive |
| `/api/runs/{id}` | DELETE | Delete a run and its data |
| `/api/scenarios` | GET | List available preset scenarios |

### Frontend

The Next.js frontend has several panels:

| Panel | Purpose |
|---|---|
| **Simulation Form** | Configure and launch a new run — target URL, concurrency, duration, ramp-up |
| **Live Chart** | Real-time line chart — throughput (RPS) + p50/p95/p99 over time |
| **Logs Panel** | Scrollable log of events — run started, VU spawned, errors, run completed |
| **Run History** | Sidebar list of past runs — click to load, compare summaries |

Communication with backend:
- **REST**: Creating runs, fetching history, loading past run details
- **SSE** (Server-Sent Events): Real-time metrics during an active run — simpler than WebSocket, one-directional, works through proxies

## Frontend Tech

- **Next.js** (App Router) — framework
- **Recharts** — charting library for the live latency/throughput charts
- **CSS grid** — 65/35 chart/sidebar split, config panel below
- No state management library — React state + custom hooks are sufficient for MVP

## Directory Layout

```
datascalr/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app, lifespan, CORS
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── runs.py          # /api/runs endpoints
│   │   │   └── scenarios.py     # /api/scenarios endpoints
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── run.py           # RunConfig, RunStatus, RunResult
│   │   │   └── metrics.py       # MetricsBucket, RunSummary
│   │   ├── engine/
│   │   │   ├── __init__.py
│   │   │   ├── runner.py        # Orchestrates a simulation run
│   │   │   └── virtual_user.py  # A single VU coroutine
│   │   ├── metrics/
│   │   │   ├── __init__.py
│   │   │   ├── collector.py     # Receives raw samples, computes buckets
│   │   │   └── store.py         # In-memory + SQLite storage
│   │   └── db.py                # SQLite setup, migrations
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Main simulation page
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── SimulationForm.tsx
│   │   │   ├── LiveChart.tsx
│   │   │   ├── LiveLogs.tsx     # Real-time log panel
│   │   │   └── RunHistory.tsx
│   │   └── lib/
│   │       └── api.ts           # Fetch wrapper + SSE client
│   └── ...
├── docs/
│   ├── 001-what-is-scale-simulation.md
│   └── 002-architecture-overview.md
├── CLAUDE.md
└── package.json
```

## Key Design Decisions

1. **SSE over WebSocket** — real-time is one-directional (server → client). SSE is simpler, works through proxies, auto-reconnects, no library needed.
2. **SQLite for persistence** — zero setup, survives restarts, enables post-run data analysis. Abstracted behind an interface for future swap to Postgres.
3. **Per-second bucketing** — each second's metrics are aggregated from raw samples. Keeps storage lean (a 5-minute run = 300 buckets) while preserving percentile accuracy.
4. **In-process engine** — virtual users run as asyncio tasks inside the FastAPI process. Ceiling ~5k VUs on consumer hardware. A separate worker process (via Locust or Celery) is a future upgrade path.
5. **Ramp-up** — VUs start staggered over the ramp-up period so you can observe the system's behavior as traffic grows, not just at full load.

## Noteworthy for Future Phases

- **Logs panel** — along with the real-time chart, a live log panel shows run events (VU spawned, request failed, run completed) for debugging and observability.
- **Scenario presets** — common patterns pre-configured (e.g., "gentle ramp", "burst", "sustained load") so you can run quickly without setting every parameter.
- **Run comparison** — overlay metrics from two runs on the same chart to compare before/after a change.
