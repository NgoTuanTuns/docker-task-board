# Docker Task Board — Multi-Replica Deployment

A task-board web application used to demonstrate containerized web deployment with Docker Compose, PostgreSQL, Redis, Socket.IO, and Nginx. The app supports authenticated task-board CRUD operations and real-time board updates. Nginx is the only service published to the host; application replicas and databases remain on the private Compose network.

## Architecture

```text
Browser(s)
   | HTTP / WebSocket
   v
Nginx (reverse proxy + load balancing, host port 8080)
   |--------------------------|
   v                          v
Node.js app replica 1 ... Node.js app replica N
   |             \            |
   |              \           +---- Redis Pub/Sub
   |               \--------------- Redis adapter for Socket.IO events
   v
PostgreSQL (persistent volume)
```

- **Nginx** proxies HTTP and WebSocket traffic and resolves the Docker service name at runtime so it can discover scaled app replicas.
- **Node.js / Express** serves the web UI and REST API.
- **Socket.IO + Redis adapter** broadcasts room events across replicas. Each client joins a `board:<id>` room.
- **PostgreSQL** stores users, boards, columns, and tasks in a persistent volume.
- **Health checks** gate startup: the app waits for PostgreSQL and Redis; Nginx waits for a healthy app service.

## Requirements

- Docker Desktop with Docker Compose v2, or Docker Engine + Compose plugin.
- Internet access for the first image/dependency download.
- Available host port `8080` by default.

## Setup and run

### 1. Configure environment

PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set a strong `POSTGRES_PASSWORD` and `JWT_SECRET`. Make sure the password in `DATABASE_URL` matches `POSTGRES_PASSWORD`. Keep `.env` private; it is ignored by Git.

### 2. Build and start one app replica

```powershell
docker compose up --build -d --scale app=1
docker compose ps
```

Open <http://localhost:8080>.

Demo accounts (seeded on an empty database):

| Email | Password | Role |
|---|---|---|
| `admin@example.com` | `admin123` | admin |
| `user1@example.com` | `user123` | member |
| `user2@example.com` | `user123` | member |

These credentials are for local demonstration only. Do not use them in a public deployment.

### 3. Check health and replica identity

```powershell
curl.exe http://localhost:8080/health
docker compose ps
docker compose logs --tail=100 app nginx redis db
```

A healthy response should include `status: "ok"`, `db: "up"`, `redis: "up"`, and a `host` value. The `host` identifies the app container that served the request.

### 4. Scale to three replicas

```powershell
docker compose up --build -d --scale app=3
docker compose ps
```

Only Nginx publishes a host port. The app service intentionally has no `ports` mapping and no fixed `container_name`, allowing Compose to create multiple replicas. Nginx uses Docker's embedded DNS resolver and an upstream with dynamic resolution to discover app replicas as they are added or removed.

To sample the app host through the load balancer in PowerShell:

```powershell
1..30 | ForEach-Object { (curl.exe -s http://localhost:8080/health | ConvertFrom-Json).host }
```

Different hostnames across the output demonstrate that requests reached different app replicas; a particular distribution is not guaranteed for a small sample.

### 5. Test real-time synchronization

1. Open the task board in two separate browser windows/profiles.
2. Sign in as two demo users and open the same board.
3. Create, update, move, or delete a task in one window.
4. Confirm the other window updates without a page refresh.
5. Repeat after scaling to three app replicas. Socket.IO clients are configured for WebSocket transport, and Redis adapter Pub/Sub propagates room events between app processes.

### 6. Test resilience to one app replica stopping

With three replicas running, list container names:

```powershell
docker compose ps
```

Stop one app container using its actual name from the output:

```powershell
docker stop <app-container-name>
```

Then repeatedly request health and open/use the application. Nginx should continue proxying to the remaining healthy app replicas after Docker DNS updates. Restore the intended replica count with:

```powershell
docker compose up -d --scale app=3
```

### 7. Run the included k6 benchmark

The benchmark requests `/health` through Nginx and reports request throughput, latency (including p95), failures, and custom health checks. It does not create or modify task data.

Run the single-replica measurement:

```powershell
docker compose up --build -d --scale app=1
docker compose --profile tools run --rm benchmark
```

Then run the three-replica measurement under the same machine/load conditions:

```powershell
docker compose up -d --scale app=3
docker compose --profile tools run --rm benchmark
```

For a longer test, configure `BENCHMARK_VUS` and `BENCHMARK_DURATION` in `.env`, for example `BENCHMARK_VUS=40` and `BENCHMARK_DURATION=120s`. Compare `http_reqs` (throughput), `http_req_duration` (average/p95), and `http_req_failed` between runs. Repeat each run several times and report the actual output; do not assume three replicas must be faster for every workload, because the database, Redis, CPU, or local machine may become the bottleneck.

## Useful commands

```powershell
# View status and logs
docker compose ps
docker compose logs -f app nginx redis db

# Stop containers but preserve database/Redis volumes
docker compose down

# Stop and delete persisted database and Redis data (destructive)
docker compose down -v
```

## Troubleshooting

- **App cannot connect to PostgreSQL:** `DATABASE_URL` must use host `db`, not `localhost`; ensure its credentials match the Postgres environment variables.
- **App cannot connect to Redis:** verify `REDIS_URL=redis://redis:6379`, then inspect `docker compose logs redis app`.
- **Dependency changes do not appear:** rebuild with `docker compose up --build`.
- **Database schema is missing:** the `db/init.sql` initialization script runs only when the PostgreSQL data directory is first initialized. A destructive reset is `docker compose down -v` followed by `docker compose up --build -d`.
- **Host port conflict:** set `PUBLIC_PORT` in `.env` to an unused port.
- **No obvious host variation:** sample more requests; load balancing is not guaranteed to alternate evenly on every pair of requests.

## Tests

Run lightweight configuration checks with Node.js:

```powershell
cd app
npm install
npm test
```

The tests validate key Compose/Nginx configuration and dependency declarations. They are not a substitute for running the multi-container integration and browser tests above.

## Security notes

The sample accounts and `.env.example` values are for local coursework only. Set unique secrets before running. Do not expose PostgreSQL or Redis ports publicly. For a production deployment, add TLS termination, stricter secret management, resource limits, Redis access controls, and monitoring.
