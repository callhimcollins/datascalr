# DataScalr

**Scale simulation platform** — understand how your system behaves under load by generating realistic traffic patterns against a real target application. Every latency and error metric comes from an actual HTTP round-trip.

## How it works

DataScalr spawns virtual users as asyncio tasks that fire real HTTP requests at your target API. A reference target API is included (FastAPI + PostgreSQL + Redis) that demonstrates cache vs. no-cache behavior under load. Results stream to a Next.js frontend via Server-Sent Events for real-time charting, and are persisted to Supabase for historical comparison.

```
┌──────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  Frontend        │────▶│  DataScalr       │────▶│  Target API (Docker)   │
│  (Next.js)       │     │  Engine (host)   │     │  PostgreSQL + Redis    │
│  Recharts UI     │◀────│  SSE stream      │     └─────────────────────────┘
│  Supabase reads  │◀────│  Metrics storage │
└──────────────────┘     └──────────────────┘
```

- **Target API** — FastAPI app with a single `GET /api/items?cached=true|false` endpoint. Cached requests hit Redis (~1ms). Uncached requests hit PostgreSQL directly (~20-80ms), causing real latency spikes under concurrency as the connection pool saturates.
- **Engine** — configurable simulation runner. Set concurrency, ramp-up duration, and endpoint weights. VUs stagger evenly across the ramp-up, then fire weighted-random requests with realistic think times (normally-distributed around platform-specific baselines).
- **Metrics** — request samples are buffered and aggregated into 1-second buckets: p50 latency and error percentage per endpoint group. A 5-minute run produces 300 bucket rows.
- **Persistence** — Supabase stores run configs, status, and aggregated results for cross-run comparison.

## Quick start

```bash
# 1. Start infrastructure (PostgreSQL, Redis, target API)
docker compose up -d

# 2. Start the DataScalr backend (hot-reload)
cd backend
python -m uvicorn app.main:app --reload --port 8000

# 3. Start the frontend (hot-reload)
cd frontend
npm run dev
```

Then open `http://localhost:3000` to configure and run a simulation.

## Project structure

```
datascalr/
├── docker-compose.yml          # PostgreSQL, Redis, target API
├── target-api/                  # Reference app under load test
│   ├── app.py                   # Cached + uncached endpoints
│   ├── Dockerfile
│   └── init.sql                 # Schema + 10k seed rows
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entrypoint
│   │   ├── db.py                # Supabase client
│   │   ├── routes/              # API route handlers
│   │   ├── schemas/             # Pydantic models
│   │   ├── engine/              # Runner + virtual user coroutines
│   │   └── metrics/             # Metrics collector and store
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/                 # Next.js App Router pages
│       ├── components/          # React components
│       └── lib/                 # API client, SSE hooks
└── docs/                        # Design documentation
```

## Running a simulation

1. Configure your simulation — set target URL, number of virtual users, ramp-up time, duration, and endpoint weights.
2. Start the run — the engine spawns VUs that send real HTTP requests to your target.
3. Watch results in real time — latency, throughput, and error charts update via SSE.
4. Browse past runs — compare results across different configurations or system changes.

## Configuration

DataScalr stores its own data (run configs, results, metrics) in Supabase — low volume, comfortably within the free tier. The target API's database runs in local Docker PostgreSQL to avoid cloud costs during high-load simulations.

## Stack

- **Backend**: Python / FastAPI + httpx (async HTTP client)
- **Frontend**: Next.js (App Router) + Recharts
- **Storage**: Supabase (run history, configs, results)
- **Infrastructure**: PostgreSQL, Redis, target API (all in Docker Compose)
- **Real-time**: Server-Sent Events
- **Engine**: In-process asyncio tasks, ceiling ~5k VUs on consumer hardware

## Design

- Real measurements, not mock data — every metric comes from an actual network round-trip to PostgreSQL and Redis.
- Minimal abstractions — build for what exists, not what might exist.
- The included target API is meant as a reference; point DataScalr at any HTTP service to load test your own system.
