# 001 — What Is Scale Simulation?

## The Problem

Imagine you just built a web app — say, a ticket booking site. You test it yourself: you click around, buy a ticket, it works. Great.

Now imagine 100 people use it at the same time. Then 1,000. Then 10,000.

Each person is clicking, searching, buying. The server has to handle all those requests simultaneously. Your database has to keep up. Your network has to carry all that traffic.

Questions that keep engineers up at night:

- Will the server crash at 500 users? At 5,000?
- Will response times get sluggish long before the crash?
- Does the database bottleneck first, or the CPU, or the network?
- If we spend \$500/month on a bigger server, how many more users can we handle?

**You can't answer these by guessing.** And you can't wait until you *have* 10,000 real users to find out — because by then, if the answer is "your app falls over," you're in a lot of trouble.

## The Solution: Scale Simulation

Scale simulation is the practice of **pretending to be many users** so you can measure how your system behaves under load *before* real users show up.

A scale simulator does two things:

1. **Generates traffic** — it makes lots of fake but realistic requests to your system.
2. **Measures what happens** — how fast does the system respond? Do errors start appearing? When does it break?

This is also called **load testing** or **stress testing**, depending on the goal:
- **Load testing**: "Can the system handle its expected traffic?"
- **Stress testing**: "Where is the breaking point?"
- **Soak testing**: "Does the system degrade over hours of sustained load?"
- **Spike testing**: "What happens when traffic suddenly doubles?"

## Key Concepts

### Virtual User (VU)

A virtual user is a simulated person. Each VU behaves like a real user would: it makes requests, waits a bit (thinking/reading), makes more requests, etc.

If you simulate 1,000 virtual users, that means 1,000 concurrent "people" all doing things on your app at once.

### Ramp-Up

You don't hit 1,000 users instantly. A real traffic surge takes time. Ramp-up is the period over which users arrive:

- "Start at 0 users, add 10 users per second until we reach 500."
- This lets you see at *what point* things start slowing down.

### Think Time

Real users don't machine-gun requests. They read a page for a few seconds, fill in a form, wait for images to load. Think time is a random delay between actions to mimic human behavior. Without it, you're measuring your server's ability to handle a DDoS attack, not real traffic.

### Throughput (RPS)

Requests per second — how many requests your system actually processes per second. If you send 1,000 req/s but the system only processes 200, you have a bottleneck somewhere.

### Latency

How long each request takes. Usually measured as:

- **Median (p50)**: Half of requests are faster than this.
- **p95**: 95% of requests are faster than this. A good measure of "what most users experience."
- **p99**: 99% of requests are faster than this. Catches the tail — the unlucky slow requests.

A system might respond in 50ms on average (great!) but take 3 seconds for the slowest 1% of requests (terrible for those users). This is why averages alone are misleading.

### Saturation Point

The moment when some resource (CPU, memory, database connections, network bandwidth) hits 100% usage and everything starts queuing up. Response times skyrocket. Throughput flatlines or drops. This is what you're trying to find and push out.

### Concurrency vs. Requests per Second

Many beginners confuse these. Concurrency = how many things are in-flight simultaneously. RPS = how many complete per second. A system can have 100 concurrent users each making 1 request per 10 seconds (10 RPS total), or 10 concurrent users each making 10 requests per second (100 RPS total). They stress the system very differently.

```
        10 users, each sending 10 req/s = 100 RPS
   vs.
       100 users, each sending 1 req/10s = 10 RPS
```

The first saturates CPU (lots of work to do). The second saturates connections (lots of open sockets).

## What DataScalr Does

DataScalr is a scale simulation platform. Its job is to:

1. Let you configure a simulation — how many users, how fast they ramp up, what actions they perform.
2. Run the simulation, firing real HTTP requests at the target system.
3. Collect and display results — response times, throughput, error rates, resource usage — in real-time charts.
4. Let you compare runs — "Did the new database index improve p95 latency?"

The goal is to give you a **self-service lab** where you can experiment: change your system, run a simulation, see if it got better or worse. Rinse and repeat.

## What DataScalr Is NOT

- **Not monitoring**: Monitoring watches your *real* production traffic. DataScalr generates *fake* traffic to find problems before they hit production.
- **Not a benchmark**: Benchmarks measure raw performance in isolation (e.g., "this CPU can do X operations/second"). Scale simulation tests your *whole system* with realistic patterns.
- **Not a load testing service**: It's a tool *you* run, not a SaaS platform you send traffic through (though it could be deployed as one).

## The Big Picture

```
         ┌──────────────────────┐
         │    DataScalr         │
         │  (simulator)         │────→ HTTP requests ───→ Your App
         │                      │                            │
         │  Virtual Users       │←── responses, timing ─────│
         │  Ramp-up control     │                            │
         │  Real-time charts    │                            ▼
         │  Result comparison   │                     Database / Cache /
         └──────────────────────┘                     External Services
```

You run DataScalr *next to* or *pointed at* your application, simulating realistic traffic patterns. The results tell you where your system is comfortable and where it breaks.

## Next

Now that you know what scale simulation is, the next doc will cover how DataScalr is architected to do this — the moving parts on both the backend (running simulations) and frontend (visualizing results).
