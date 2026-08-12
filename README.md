# AI App Starter

A small full-stack starting point for building authenticated AI applications.

## Includes

- React + Vite frontend
- Node 24 API
- tRPC + React Query
- PostgreSQL + Drizzle
- Better Auth with email/password
- One authenticated project CRUD domain
- One authenticated OpenAI streaming endpoint
- Docker-based local database

The starter intentionally does not include persisted chat history, multiple
providers, tools, workflows, organizations, files, billing, or cloud-specific
deployment. Add those when the product needs them.

## Quickstart

Requirements: Node 24, npm, Docker and `just`.

```bash
npm install
cp .env.example .env
just dev
```

Open [http://localhost:5173](http://localhost:5173). Create an account, create
a project, and use the AI playground. Add `OPENAI_API_KEY` to `.env` to enable
streaming inference.

## Architecture

```text
Web -> tRPC -> project domain -> database access -> PostgreSQL
Web -> /api/ai/stream -> inference package -> OpenAI
Web -> /api/auth/* -> Better Auth -> PostgreSQL
```

Business logic lives in `packages/trpc/src/domain`. Database queries live in
`packages/trpc/src/database/access`. HTTP adapters stay in `apps/api`.

## Commands

```bash
just dev          # start PostgreSQL, migrate, API and web
just db           # start PostgreSQL only
just db-reset     # recreate the local database and migrate
just db-down      # stop PostgreSQL
just check        # typecheck, lint, tests and web build
npm run db:generate
npm run db:migrate
```

## Adding a feature

For a database-backed feature, add the schema, access functions, domain
operations, contracts, router, then frontend query/mutations. Keep ownership
checks in the server and use `protectedProcedure` for authenticated routes.

For a model feature, extend `packages/inference/src/index.ts` only after a
real requirement exists. The starter has one provider and one stream contract
on purpose.

## Production boundary

The API can run in any Node 24 environment with PostgreSQL. Build the web app
with `npm run build:web` and deploy `apps/web/dist` to a static host that
proxies `/api` to the API. No cloud provider is assumed.
