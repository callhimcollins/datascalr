# How DataScalr Works — Under the Hood

## The Big Picture

DataScalr is a load-testing platform. You tell it what kind of API you want to test, it spawns virtual users, and they fire real HTTP requests at a target API while measuring latency and errors. The whole thing is designed to show you *how a system behaves under load* — where it slows down, where it breaks, and what's causing it.

There are three separate systems running at once:

```
Your browser (Next.js)  ──▶  DataScalr Engine (FastAPI)  ──▶  Target API (FastAPI in Docker)
                                   │                              ├── PostgreSQL
                                   │                              └── Redis
                                   └── Supabase (history storage)
```

---

## 1. Async Everything — The Engine's Superpower

### What is asyncio?

When a normal Python program runs, it does one thing at a time. If it waits for a network response, the whole program freezes until that response comes back. That's called **synchronous** code.

```python
# Synchronous — blocks the whole program
response = requests.get("http://api.com/items")  # program freezes here
print(response.json())  # runs after the response arrives
```

DataScalr uses **asyncio**, Python's async/await system. Async code lets you *pause* a task while waiting, and do something else in the meantime:

```python
# Asynchronous — pauses just this one task
response = await client.get("http://api.com/items")  # pause, go do other stuff
print(response.json())  # runs after the response arrives
```

### The Event Loop

The **event loop** is the traffic cop that manages all these paused tasks. Imagine you have 1000 virtual users, all waiting for their HTTP responses. The event loop cycles through them:

1. VU #1: "I'm waiting for my HTTP response, check on me later"
2. VU #2: "My response arrived! I can record the latency and fire another request"
3. VU #3: "I'm in my sleep phase for 0.1 seconds, wake me up later"
4. VU #4: "I'm waiting for an HTTP connection slot..."
5. ...repeat for all 1000 VUs
6. Goes back to VU #1: "Your response arrived? No? Okay, next..."

This switching is fast — hundreds of thousands of switches per second — but each switch costs a tiny bit of time. With 1000 VUs all becoming "ready" at the same time, the switching overhead eats into actual work. That's why **10 VUs produce proportionally more throughput per VU than 1000 VUs**.

### Uvicorn — The ASGI Server

When you start the backend with `uvicorn app.main:app --port 8000`, you're starting an **ASGI server**. ASGI (Asynchronous Server Gateway Interface) is the modern async version of WSGI (the old standard for Python web servers).

Uvicorn:
- Listens for incoming HTTP connections on port 8000
- Each incoming request becomes an asyncio task
- Routes the request to the right handler in FastAPI
- Runs the event loop that drives everything

Without Uvicorn, there's no event loop running. Uvicorn is the engine that keeps the async machinery spinning.

---

## 2. FastAPI — The Web Framework

FastAPI is a Python web framework built on top of Uvicorn and Starlette. It handles:

- **Routing**: matching URLs like `/api/runs` to the right function
- **Request parsing**: converting incoming JSON to Pydantic models (validated data objects)
- **Response serialization**: converting Python dicts back to JSON
- **CORS**: allowing the frontend (port 3000) to talk to the backend (port 8000)

Every route handler in DataScalr is an `async def` function, meaning it runs inside the event loop alongside the VUs.

```python
@router.post("/api/runs")
async def start_run(req: StartRunRequest):
    # This runs on the same event loop as the VUs
    # So while the VUs are firing requests, this can still respond to API calls
```

---

## 3. Virtual Users — The Load Generators

Each **virtual user** is a single asyncio task. When you start a run with 100 VUs, DataScalr creates 100 tasks, each running the same loop:

```
Pick an endpoint (weighted random)
Build the URL (replace placeholders like :term)
Send the HTTP request (httpx)
Record: how long it took, what status code, any errors
Sleep for "think time"
Repeat
```

### The VU Loop (simplified)

```python
while not stop_event.is_set():
    # 1. Pick which endpoint to hit (weighted random)
    endpoint = pick_endpoint(endpoints)

    # 2. Build the URL
    url = build_url(base_url, endpoint)

    # 3. Fire the request — this pauses the VU while waiting
    start = time.monotonic()
    resp = await client.request(method, url, ...)
    latency = (time.monotonic() - start) * 1000

    # 4. Record the sample
    collector.add_sample(Sample(latency_ms=latency, ...))

    # 5. Sleep for think time — pauses again
    await asyncio.sleep(think_time)
```

The key insight: **every `await` is a pause point**. When a VU does `await client.request(...)`, it tells the event loop "I'm waiting for the network — go run another VU." Similarly, `await asyncio.sleep(think_time)` says "I'm not doing anything for 0.1s — go run another VU."

This is how 100 VUs can run "simultaneously" on a single CPU core — at any given microsecond, only a few are actively doing work. The rest are paused, waiting for something (network, timer, lock).

### Staggered Ramp-Up

VUs don't all start at once. If you set ramp-up to 5 seconds for 100 VUs:

```
Second 0: VU 0 starts
Second 0.05: VU 1 starts
Second 0.10: VU 2 starts
...
Second 5: VU 99 starts
```

This prevents a "thundering herd" — all 100 VUs firing their first request at the exact same millisecond.

---

## 4. httpx — The HTTP Client

**httpx** is an async HTTP client library. It's like the popular `requests` library, but async. Each VU uses a shared `httpx.AsyncClient` instance.

### The Connection Pool

When VU #1 fires `await client.get("http://target-api:8001/api/items")`, httpx:

1. Checks if there's already a keep-alive TCP connection to `target-api:8001` in the pool
2. If yes, reuses it (cheaper than opening a new one)
3. If no, opens a new TCP connection (a few round-trips of network overhead)
4. Sends the HTTP request over that connection
5. When the response comes back, keeps the connection in the pool for reuse

The pool is limited to **1000 max connections**. This is what causes the bottleneck with 1000+ VUs. When all 1000 connections are in use (some sending requests, some waiting for responses), the next VU that tries to fire has to wait — it's enqueued until a connection slot opens up.

With 10 VUs, every VU gets a connection instantly. With 1000 VUs, many are waiting in line, and by the time a slot opens, their effective rate drops below 2 req/s. That's why they don't trigger the rate limiter.

### The 10-Second Timeout

Every request has a 10-second timeout. If the target API doesn't respond within 10 seconds, the request fails with a timeout error. This prevents VUs from hanging forever on a dead target, but it also means that under extreme load, requests time out instead of completing — which itself becomes a signal in the analysis ("Redis under strain", "PG pool saturated").

---

## 5. SSE — Real-Time Streaming

**Server-Sent Events (SSE)** is a protocol for streaming data from a server to a browser over a single HTTP connection. Unlike WebSockets (which are bidirectional), SSE is one-way: server → client.

When you start a run on the frontend, it opens an SSE connection:

```
Frontend: GET /api/runs/{run_id}/stream
Backend:  ──► data: {t: 1, cacheHit: 3.2ms, ...}
          ──► data: {t: 2, cacheHit: 3.5ms, ...}
          ──► data: {t: 3, cacheHit: 4.1ms, ...}
          ──► data: {done: true, comparison: {...}}
```

Every 1 second, the backend:
1. Grabs all samples collected in that second from the `MetricsCollector`
2. Computes aggregates (p50/p95/p99 latency, error rates, RPS)
3. Runs the `analyze()` function to detect events
4. Sends the bucket as a JSON line in the SSE stream

The frontend receives each line, appends it to the chart data, and Recharts re-renders the graph. This is what makes the chart update live every second.

### SSE vs WebSockets

SSE was chosen over WebSockets because:
- SSE is simpler (just HTTP, no handshake protocol)
- SSE auto-reconnects if the connection drops
- The data flows only one way (server → client), which is all we need

---

## 6. Docker — The Target Infrastructure

Docker runs three services:

**PostgreSQL:**
- The target API's database
- Has 1 table with 10,000 seed rows of realistic JSON data
- max_size=4 connection pool — intentionally small to create contention under load
- When 100 VUs hit the uncached endpoint, those 4 connections become the bottleneck (queries queue up)

**Redis:**
- Cache layer for the target API
- 10-second TTL on cached data
- Single-threaded — under high request volume, commands queue up and latency increases
- When Redis slows, the cached endpoint shows higher latency, which is a signal in the analysis

**Target API:**
- A simple FastAPI app with 3 endpoints: list items, search items, get stats
- Each accepts `?cached=true/false` to control whether Redis is checked first
- In rate limiting mode, has middleware that returns 429 for VUs exceeding their per-second limit
- The rate limiter uses a fixed 1-second window per VU: count how many requests each `X-VU-ID` sends in the current second, reject if over the limit

---

## 7. Supabase — History Storage

Supabase is a hosted PostgreSQL with a REST API. DataScalr uses it to store:

- **simulation_parents**: each time you generate a config, it creates a "parent" (groups related runs together)
- **simulation_runs**: each actual simulation run, with its metrics, comparison, and analysis

Supabase is accessed via its REST API (not a direct Python driver). The `supabase_client.py` file wraps this with simple functions:

```python
async def insert(table, data):    # POST to create a row
async def get(table, id_col, id): # GET a single row
async def update(table, ...):     # PATCH to update a row
```

This is a lightweight integration — no ORM, no schema migrations, just raw HTTP calls. When a run completes, the result is persisted best-effort (if Supabase is down, the run data is still in memory).

---

## 8. Next.js + Recharts — The Frontend

**Next.js** is a React framework that runs on port 3000. The App Router organizes pages by directory: `/configure`, `/simulate`, `/history`, `/runs/[id]`.

**Recharts** is a charting library for React. Each chart is a composition of components:

```tsx
<AreaChart data={latencyHistory}>
  <XAxis dataKey="t" />          {/* time in seconds */}
  <YAxis />                       {/* latency in ms */}
  <Tooltip />                     {/* hover tooltip */}
  <Area dataKey="cacheHit" />     {/* green area */}
  <Area dataKey="noCache" />      {/* red area */}
</AreaChart>
```

The data flows:
1. SSE connection delivers a new data point every second
2. `useSSE` hook appends it to `latencyHistory`
3. React re-renders the chart with the new point
4. Recharts smoothly animates the update

### The Mode Selector

The configure page has a two-option mode selector:

- **Cache Comparison**: AI generates profiles with cached vs uncached endpoints. Charts compare cache hit latency vs no-cache latency. The "comparison" shows which is faster and by how much.
- **Rate Limiting**: AI generates abuse/scraping profiles. The target API enforces a per-VU ceiling. Charts show total RPS vs rate-limited count (429s). The "comparison" shows average throughput and what % of requests were rejected.

---

## 9. DeepSeek — AI Config Generation

When you describe your API on the configure page, the description is sent to DeepSeek's API (an LLM similar to Claude) to generate traffic profiles.

The request:

```
POST to DeepSeek API
System prompt: "You are a config generator for DataScalr. Generate 3 profiles..."
User message: "{platform description}"
Response: {"profiles": [{"label": "...", "endpoints": [...]}]}
```

The system prompt tells DeepSeek what format to use and what rules to follow (endpoint patterns, weight distribution rules). The response is parsed into `Profile` objects and stored in Supabase.

The two prompts differ:
- **Cache mode**: endpoints must have `?cached=true/false`, 2 endpoints per profile (one cached, one not)
- **Rate limiting mode**: endpoints without cache params, 1-3 endpoints per profile, abuse/scraping patterns

---

## 10. Putting It All Together — A Request's Journey

Here's what happens when an endpoint weight bar appears on the configure page:

```
1. You type "A social media feed API" and click Next
2. Frontend sends POST /api/generate-config to DataScalr API
3. FastAPI route handler runs on Uvicorn's event loop
4. Route handler calls DeepSeek API with the system prompt + your description
5. DeepSeek returns JSON with 3 profiles, each with weighted endpoints
6. Profiles are saved to Supabase (simulation_parents table)
7. Profiles are returned to the frontend
8. Recharts renders the weight bars for each profile

Then when you click Simulate:

9. POST /api/runs creates a run_id and spawns the engine
10. Engine creates N VU tasks, staggered over ramp-up
11. Each VU begins its loop: pick endpoint → fire HTTP → record → sleep
12. httpx manages the connection pool (max 1000 concurrent connections)
13. Every 1 second, MetricsCollector aggregates all samples into a bucket
14. analyze() checks the bucket for events (cache storm, PG degradation, etc.)
15. Bucket is sent as SSE to the frontend
16. Recharts renders the new data point in real time
17. At the end, a "comparison" is computed and sent
18. Results are persisted to Supabase
19. You can view them later on the history page
```

---

## Key Terms Glossary

| Term | What it is |
|------|-----------|
| **asyncio** | Python's async system — lets you pause tasks while waiting |
| **Event loop** | Traffic cop that manages paused tasks and decides which runs next |
| **Uvicorn** | ASGI server that hosts FastAPI and runs the event loop |
| **httpx** | Async HTTP client that VUs use to fire requests |
| **Connection pool** | Pool of reusable TCP connections in httpx (max 1000) |
| **Virtual User (VU)** | A single asyncio task running the request loop |
| **Think time** | Artificial delay between VU requests (~0.1-2s depending on mode) |
| **SSE** | Server-Sent Events — one-way real-time data stream |
| **Recharts** | React charting library used for live graphs |
| **Ramp-up** | Gradual start of VUs (not all at once) |
| **Bucket** | 1-second aggregate of all VU samples |
| **429** | HTTP status for "Too Many Requests" (rate limited) |
