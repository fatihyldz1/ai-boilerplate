#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

check_name="starter-check-$$"
network_id=""
database_id=""
api_id=""
cleanup() {
  result=$?
  if [ "$result" -ne 0 ] && [ -n "$api_id" ]; then docker logs "$api_id" >&2 || true; fi
  if [ -n "$api_id" ]; then docker rm --force "$api_id" >/dev/null || true; fi
  if [ -n "$database_id" ]; then docker rm --force "$database_id" >/dev/null || true; fi
  if [ -n "$network_id" ]; then docker network rm "$network_id" >/dev/null || true; fi
}
trap cleanup EXIT

image_id="$(docker build -q .)"
network_id="$(docker network create "$check_name")"
database_id="$(docker run -d --network "$network_id" --network-alias db \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_DB=starter -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=container-test-only \
  postgres:17-alpine)"

for attempt in {1..60}; do
  if docker exec "$database_id" pg_isready -U postgres -d starter >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 60 ]; then docker logs "$database_id" >&2; exit 1; fi
  sleep 1
done

runtime_env=(--network "$network_id"
  -e ENVIRONMENT=production -e LOG_FORMAT=json
  -e DB_URL=postgres://postgres:container-test-only@db:5432/starter
  -e BETTER_AUTH_URL=http://localhost:3000
  -e BETTER_AUTH_SECRET=container-test-only-secret-with-more-than-32-characters)

docker run --rm "$image_id" node --input-type=module -e \
  'import assert from "node:assert/strict"; assert.throws(() => import.meta.resolve("drizzle-kit"));'
docker run --rm "${runtime_env[@]}" "$image_id" npm run db:migrate
docker run --rm "${runtime_env[@]}" "$image_id" npm run db:migrate
api_id="$(docker run -d "${runtime_env[@]}" "$image_id")"

for attempt in {1..60}; do
  if docker exec "$api_id" node -e \
    'fetch("http://localhost:3000/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 60 ]; then exit 1; fi
  sleep 1
done

docker exec -i "$api_id" node --input-type=module-typescript < scripts/container-smoke.ts
