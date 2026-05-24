# DataScalr — Scale Simulation Platform

DataScalr is a scale simulation platform for load testing web applications. It generates realistic traffic patterns via virtual users and visualizes results in real time.

## Tech Stack

- **Backend**: Python / FastAPI + httpx (async HTTP client)
- **Frontend**: Next.js (App Router) + Recharts
- **Storage**: SQLite (via aiosqlite)
- **Real-time**: Server-Sent Events (SSE)
- **Engine**: In-process asyncio tasks (virtual users), ceiling ~5k on consumer hardware

## Project Structure

```
backend/
  app/
    main.py           # FastAPI entrypoint, CORS, lifespan
    routes/           # API endpoint handlers
    schemas/          # Pydantic models
    engine/           # Simulation runner + virtual user coroutines
    metrics/          # Metrics collection, bucketing, storage
    db.py             # SQLite setup
frontend/
  src/
    app/              # Next.js App Router pages
    components/       # React components (one file or one folder per component)
    lib/              # Shared utilities, icons, theme, API client, SSE helpers
docs/                 # Educational design docs (numbered)
```

## Running Locally

```bash
# Backend
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm run dev

# Both (from root)
npm run dev
```

## Design Principles

- **Practical over clever** — simple code is preferred over premature abstraction
- **Minimal comments** — name things well, don't explain what the code does
- **No overengineering** — build for what exists, not what might exist
- **Data persistence matters** — every run is stored so results compound into a dataset for analysis
- **Extract proactively** — when something could reasonably be its own component or module, extract it. SVGs to `lib/icons.tsx`, standalone markup to components, CSS modules alongside components. Don't wait for duplication.
