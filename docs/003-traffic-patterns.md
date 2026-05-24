# 003 — Traffic Patterns

## The Problem

Most load testing tools let you hit a single URL with 1,000 concurrent users. That tells you one thing: how your system handles 1,000 identical requests to the same endpoint.

Real traffic doesn't look like that. Real users do a mix of things — they read data, fill in forms, update records, delete things. Each type of request stresses your system differently:

- **Reads** (GET) — cheap, stateless, easy to parallelize. Tests database query performance and connection pool capacity.
- **Writes** (POST) — hit your database write path, trigger validation, indexing, and cache invalidation.
- **Updates** (PUT/PATCH) — may cause lock contention, trigger side effects (webhooks, search reindexing, event emissions).
- **Deletes** (DELETE) — can cascade through related records, trigger clean-up jobs, or cause lock escalations.

If you only test with GET requests, you'll miss the failure modes that only show up under mixed load.

## The Solution: Weighted Endpoint Mix

DataScalr lets you describe your API in natural language, then generates a **traffic configuration** — a set of endpoints with weights that determine what proportion of all requests go to each one.

```
GET    /posts        — 50% of traffic  (listing — most common)
GET    /posts/:id    — 20%             (viewing one item)
POST   /posts        — 10%             (creating new items)
PUT    /posts/:id    — 10%             (updating existing items)
DELETE /posts/:id    — 10%             (deleting items)
```

Each virtual user randomly picks an endpoint based on these weights, so over the course of a run the overall traffic profile matches the configured mix.

## Why the Mix Matters

### Read/Write Contention

A system that handles 500 GET/s fine might fall apart when 50 POST/s are mixed in — writes lock rows, invalidate caches, or fill up the WAL. The weighted mix surfaces this.

```
GET-only test:       500 req/s, p50=12ms, p99=45ms   ✓
Mixed test:          450 GET + 50 POST, p50=28ms, p99=210ms   ✗
```

### Database Locking

POST and PUT requests often touch the same rows (e.g., incrementing a counter, updating a user's "last active" timestamp). Under concurrent load, these can queue up behind row or table locks, creating a bottleneck that pure GET testing would never reveal.

### Cascading Effects

Deletes are especially dangerous. A DELETE that cascades to related tables might work fine in isolation but bring the database to its knees when 50 concurrent users each trigger a cascade at the same time.

### Resource Mix

Different endpoints stress different resources:

| Endpoint Type | CPU | Memory | Disk I/O | Network |
|---|---|---|---|---|
| GET (list) | Query planning | Result set | Index scan | Response body |
| POST | Validation, serialization | Request body | Write transaction | Request upload |
| PUT | Re-validation | Temp buffers | Update + index | Request upload |
| DELETE | Cascade planning | — | B-tree rebalance | — |

A read-heavy mix tests your database cache hit ratio. A write-heavy mix tests your disk I/O and transaction throughput. The right mix for *your* system depends on what your real users do.

## Path Parameters

Endpoints like `GET /posts/:id` or `DELETE /posts/:id` use **path parameters** — the `:id` is replaced with a concrete value per-request. Virtual users generate these IDs dynamically, typically picking from IDs created during the run. This spreads requests across different rows rather than hammering the same record.

This matters because:
- It tests index performance across a range of values, not just a hot row.
- It avoids one row becoming a contention point.
- It better simulates real user behavior (different users look at different things).

## Body Templates

When an endpoint expects a request body (POST, PUT), DataScalr includes a `body_template` — a skeleton with placeholder values:

```json
{
  "title": "string",
  "content": "string",
  "priority": 1
}
```

Each virtual user generates unique payloads from the template, randomizing string lengths, numeric values, and booleans. This validates:
- Request parsing and size limits under load.
- Database write throughput with varying payload sizes.
- JSON serialization/deserialization performance.

## When Different Mixes Make Sense

| Goal | Recommended Mix |
|---|---|
| **Read-heavy load test** (typical CRUD app) | 60% GET, 20% GET/:id, 10% POST, 5% PUT, 5% DELETE |
| **Write-heavy stress test** (logging, ingestion) | 80% POST, 10% GET, 10% others |
| **Content management** (CMS) | 30% GET, 30% GET/:id, 20% POST, 10% PUT, 10% DELETE |
| **Delete-heavy** (cleanup jobs, TTL expiration) | 40% DELETE, 30% GET, 30% others |

The best mix is one that mirrors your real traffic — dig into your analytics if you have them.

## Summary

Testing one endpoint in isolation misses most real-world failure modes. A weighted traffic mix that includes reads, writes, updates, and deletes:

- Reveals read/write contention you'd otherwise miss.
- Surfaces database locking and cascading effects.
- Exercises different system resources proportionally.
- Produces results you can actually trust before going to production.
