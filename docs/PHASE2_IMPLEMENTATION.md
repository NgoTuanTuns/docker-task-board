# Phase 2 implementation notes

This file records the code-level changes in Phase 2. It is implementation documentation, not the final academic report.

## Components added

- Redis 7 with AOF persistence and a `redis-cli ping` health check.
- `@socket.io/redis-adapter` and Redis publisher/subscriber clients in each app replica.
- Nginx reverse proxy with WebSocket upgrade headers, `least_conn` balancing, and runtime Docker DNS resolution (`127.0.0.11`).
- A k6 benchmark service under the optional `tools` profile.
- `/health` now reports PostgreSQL, Redis, and the serving container hostname.
- Each replica logs every new Socket.IO connection with its hostname and sends it to the client as `server:hello`.
- Nginx keeps keep-alive connections to the replicas for REST requests (`Connection` header empty unless the client asks for a WebSocket upgrade) and waits at most 2 s (`proxy_connect_timeout`) for a replica before trying another one, so a stopped replica delays a request instead of failing it.
- The Dockerfile uses `npm ci --omit=dev` again, as described in Section 6.2; the lock file now contains the Redis packages.

## Verification

- `cd app && npm test`: 4 configuration tests pass.
- The application was run outside Docker with PostgreSQL 16, Redis 7, Nginx 1.29.8 built from source, and three Node.js 22 processes with different hostnames behind the same Nginx configuration (static upstream servers instead of the Docker resolver). Requests alternated between the three processes, six Socket.IO connections spread over the three processes received every event, and when a process was stopped its connections reconnected to the other processes after about 1.2 s. With a replica that silently drops new connections, one request took 2 s and was then served by another replica.
- The Docker measurements of Chapter 7 were taken on the test machine with helper scripts that are not part of this repository (Intel Core i5-12450H, Windows 11, Docker Desktop with Engine 29.6.1): 30 sequential requests were split 10/10/10 over three replicas; six WebSocket connections on three replicas received 18 of 18 events; after one replica was stopped, the first request failed after 2.1 s, the next 19 succeeded, and the two affected connections reconnected to other replicas after 2.6 s and 6.2 s; k6 with 50 virtual users and no pause measured 1,299 req/s (p95 62.2 ms) for one replica and 1,716 req/s (p95 48.9 ms) for three replicas, mean of three runs each, with no failed requests.
- Tool containers must be started with `docker compose run --no-deps`. Without it, Compose reconciles the dependencies of the tool and scales `app` back to one replica; this happened in the first evaluation run.
