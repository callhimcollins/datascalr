# Deployment

Single-VPS deployment with Docker Compose + Caddy.

## Architecture

```
VPS
├── Caddy (port 80/443, auto SSL with domain)
├── Frontend (Next.js container :3000)
├── Backend (uvicorn container :8000) ─── Supabase (cloud)
├── Target API (FastAPI container :8000)
├── PostgreSQL 16 (Docker)
└── Redis 7 (Docker)
```

## Quick Start

### 1. Provision a VPS

Minimum: **2 vCPU, 2 GB RAM, 20 GB SSD** ($6-12/mo).

Recommended providers:
- [Hetzner CX22](https://www.hetzner.com/cloud) (~$6/mo)
- [Digital Ocean Basic](https://www.digitalocean.com/pricing) (~$12/mo)

Install Docker and docker compose:

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# log out and back in, or: newgrp docker
```

### 2. Get the code

```bash
git clone https://github.com/YOUR_USER/datascalr.git
cd datascalr
```

### 3. Set environment variables

Create a `.env.prod` file in the project root (not checked in — keep it secure):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
DEEPSEEK_API_KEY=sk-your-key
DOMAIN=datascalr.example.com
```

Get `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from your Supabase project dashboard → Project Settings → API. `DOMAIN` is optional — leave empty for HTTP-only access via IP.

### 4. Start everything

```bash
# Start infrastructure (PostgreSQL, Redis, Target API)
docker compose up -d

# Start app services (backend, frontend, Caddy)
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

The seed data (10k rows) loads automatically into PostgreSQL on first start via `target-api/init.sql`.

### 5. Visit

- **With a domain** — `https://datascalr.example.com` (auto SSL via Let's Encrypt)
- **Without a domain** — `http://YOUR_VPS_IP` (HTTP only)

## Updating

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod build --no-cache
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Common Tasks

### View logs
```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
```

### Restart a service
```bash
docker compose -f docker-compose.prod.yml restart backend
```

### Stop everything
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

### Reset the target database (loses seed data)
```bash
docker compose down -v
docker compose up -d
```

## Notes

- The frontend is built with `NEXT_PUBLIC_API_URL=""` so all API calls use same-origin relative paths (proxied through Caddy).
- The backend connects to the target API via Docker DNS (`http://target-api:8000`), not localhost.
- Supabase stays cloud-hosted — no local Supabase instance.
- Caddy's SSL certificates persist in a named Docker volume (`caddy_data`).
