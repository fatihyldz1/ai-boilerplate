set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
    @just --list

dev:
    npx concurrently "just dev-api" "npm -w @app/web run dev"

dev-api:
    docker compose up -d postgres
    until docker compose exec -T postgres pg_isready -U "$${DB_USER:-postgres}" -d "$${DB_NAME:-starter}" >/dev/null 2>&1; do sleep 1; done
    npm run db:migrate
    npm -w @app/api run dev

db:
    docker compose up -d postgres

db-down:
    docker compose stop postgres

db-reset:
    docker compose down -v
    just db
    npm run db:migrate

check:
    npm run check

api *args:
    npm -w @app/api run {{args}}
