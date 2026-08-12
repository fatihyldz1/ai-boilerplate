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

## Use this template

After creating a repository from this template:

1. Rename `AI App Starter` in `apps/web/src` and `packages/trpc/src/auth.ts`.
2. Rename the `project` domain when the first real product domain is known.
3. Replace the development values in `.env`.
4. Generate a unique production `BETTER_AUTH_SECRET` with at least 32 characters.
5. Update the application URL and database URL before deployment.
6. Run `npm run db:generate` after changing the Drizzle schema.

Do not carry the example project domain into production accidentally; it exists
only to demonstrate the complete request path.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_URL` | Yes | Public URL used by Better Auth |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret; 32+ characters |
| `OPENAI_API_KEY` | For AI | OpenAI API access |
| `OPENAI_MODEL` | No | Defaults to `gpt-5-nano` |

`OPENAI_API_KEY` may be empty during local setup. The application and database
still run; only the AI playground is unavailable.

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
just check-integration # database-backed integration tests
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

Run `npm run db:migrate` against the target production database before starting
the API. Never use `just db-reset` against production.
