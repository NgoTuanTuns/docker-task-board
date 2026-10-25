# Phase 2 implementation notes

This file records the code-level changes in Phase 2. It is implementation documentation, not the final academic report.

## Components added

- Redis 7 with AOF persistence and a `redis-cli ping` health check.
- `@socket.io/redis-adapter` and Redis publisher/subscriber clients in each app replica.
- Nginx reverse proxy with WebSocket upgrade headers, `least_conn` balancing, and runtime Docker DNS resolution (`127.0.0.11`).
- A k6 benchmark service under the optional `tools` profile.
- `/health` now reports PostgreSQL, Redis, and the serving container hostname.

## Verification performed in the source workspace

- `node --check app/server.js` — passed.
- `cd app && npm test` — 3 configuration tests passed.
- Docker Compose YAML parsed successfully with PyYAML.

## Runtime verification still required

Docker was not available in the source workspace, and the npm registry could not be reached while preparing the package lock. Therefore, a full `docker compose up`, Nginx configuration test inside its image, multi-replica browser test, failure test, and k6 benchmark have not been run here. Run `npm install` in `app/` once to refresh `package-lock.json` with the new adapter dependencies, then run the integration steps in `README.md` and commit the refreshed lockfile before submission.
