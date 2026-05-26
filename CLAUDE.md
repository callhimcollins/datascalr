# DataScalr — Scale Simulation Platform

DataScalr is a scale simulation platform for load testing web applications. It generates realistic traffic patterns via virtual users and visualizes results in real time. Unlike naive mocks, virtual users fire real HTTP requests at a target API backed by PostgreSQL and Redis, producing genuine latency and error measurements.

## Tech Stack

- **Backend**: Python / FastAPI + httpx (async HTTP client)
- **Frontend**: Next.js (App Router) + Recharts
- **Storage**: Supabase (configs, run history, results)
- **Target DB**: PostgreSQL (via asyncpg, in Docker)
- **Cache**: Redis (in Docker)
- **Target API**: FastAPI reference app (in Docker)
- **Real-time**: Server-Sent Events (SSE)
- **Engine**: In-process asyncio tasks (virtual users), ceiling ~5k on consumer hardware

## Project Structure

```
datascalr/
├── docker-compose.yml                # PostgreSQL, Redis, target API
├── target-api/                       # Reference app that gets load-tested
│   ├── app.py                        # FastAPI with cached + uncached endpoints
│   ├── Dockerfile
│   ├── requirements.txt
│   └── init.sql                      # Schema + 10k seed rows
├── backend/
│   ├── .env
│   ├── requirements.txt
│   └── app/
│       ├── main.py                   # FastAPI entrypoint, CORS, lifespan
│       ├── db.py                     # Supabase client (configs, run history)
│       ├── routes/                   # API endpoint handlers
│       ├── schemas/                  # Pydantic models
│       ├── engine/                   # Simulation runner + virtual user coroutines
│       └── metrics/                  # Metrics collection, bucketing, storage
├── frontend/
│   └── src/
│       ├── app/                      # Next.js App Router pages
│       ├── components/               # React components
│       └── lib/                      # Shared utilities, API client, SSE hooks
└── docs/                             # Design docs (numbered)
```

## Architecture Overview

Three tiers, two of which run in Docker:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  Frontend        │────▶│  DataScalr       │────▶│  Target API (Docker)   │
│  (Next.js :3000) │     │  Engine (host)   │     │  (FastAPI :8001)       │
│                  │◀────│  SSE stream      │     ├─────────────────────────┤
│  Recharts charts │     │  MetricsCollector│     │  GET /api/items        │
│  Supabase read   │◀────│  save to Supabase│     │  ?cached=true  → Redis │
└─────────────────┘     └──────────────────┘     │  ?cached=false → PG    │
                                                  └────────┬───────┬───────┘
                                                  ┌────────▼───────▼───────┐
                                                  │  docker-compose        │
                                                  │  PostgreSQL  :5432     │
                                                  │  Redis       :6379     │
                                                  └────────────────────────┘
```

### DataScalr Engine (host, hot-reload)

The engine spawns virtual users as asyncio tasks inside the FastAPI process. Each VU runs a loop: pick an endpoint by weight → fire an httpx request → record latency/status → report to the MetricsCollector → sleep for think time. VUs are staggered over the ramp-up period.

There is no mock data or sigmoid math — every metric comes from a real HTTP round-trip to the target API.

### Target API (Docker)

A reference FastAPI app with a single endpoint that demonstrates cache vs no-cache behavior:

- `GET /api/items?cached=true` — checks Redis first. On hit, returns immediately (~1ms). On miss, queries PostgreSQL, caches the result in Redis with a TTL, returns (~20ms).
- `GET /api/items?cached=false` — queries PostgreSQL directly every time. Under load, PG connection pool contention causes real latency spikes and timeouts.

Seeded with 10,000 realistic JSON rows.

### Data Storage

- **Supabase** — stores DataScalr's own data: simulation configs, run history, and aggregated metrics buckets. Low request volume (one row per run), well within the free tier.
- **PostgreSQL (Docker)** — the target API's database, hammered by virtual users during simulations. Runs locally — no request limits or surprise bills.
- **Redis (Docker)** — the target API's cache layer, demonstrating the latency gap between cached and uncached queries.

## Running Locally

```bash
# Terminal 1: Infrastructure (Docker)
docker compose up -d

# Terminal 2: DataScalr backend (hot-reload)
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Terminal 3: Frontend (hot-reload)
cd frontend
npm run dev

# All at once (from root, no hot-reload for backend)
npm run dev
```

## Design Principles

- **Practical over clever** — simple code is preferred over premature abstraction
- **Minimal comments** — name things well, don't explain what the code does
- **No overengineering** — build for what exists, not what might exist
- **Real measurements, not mock data** — every latency and error metric comes from an actual HTTP request and database query
- **Data persistence matters** — every run is stored so results compound into a dataset for analysis
- **Extract proactively** — when something could reasonably be its own component or module, extract it. SVGs to `lib/icons.tsx`, standalone markup to components, CSS modules alongside components. Don't wait for duplication.
