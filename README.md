# AI App Starter

A small full-stack starting point for building authenticated AI applications.

## Includes

- React + Vite frontend
- Node 24 API
- tRPC + React Query
- PostgreSQL + Drizzle
- Better Auth with email/password
- One authenticated project CRUD domain
- Authenticated, bounded OpenAI-compatible text streaming
- A read-only project-agent example with task budgets and validated tool calls
- An opt-in behavioral evaluation command
- Docker-based local database

The starter intentionally does not include persisted chat history, multiple
provider SDK adapters, write tools, workflow engines, organizations, files, billing, or cloud-specific
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

| Variable                     | Required | Purpose                                                                   |
| ---------------------------- | -------- | ------------------------------------------------------------------------- |
| `DB_URL`                     | Yes      | PostgreSQL connection string                                              |
| `BETTER_AUTH_URL`            | Yes      | Public URL used by Better Auth                                            |
| `BETTER_AUTH_SECRET`         | Yes      | Session signing secret; 32+ characters                                    |
| `OPENAI_API_KEY`             | For AI   | Provider or gateway API access                                            |
| `OPENAI_MODEL`               | No       | Defaults to `gpt-5-nano`                                                  |
| `OPENAI_BASE_URL`            | No       | Defaults to `https://api.openai.com/v1`                                   |
| `OPENAI_TOKEN_LIMIT_FIELD`   | No       | `max_completion_tokens` (default), or `max_tokens` for current modelgate  |
| `AI_MAX_OUTPUT_TOKENS`       | No       | Output and reasoning token cap; defaults to 4096                          |
| `AI_TIMEOUT_MS`              | No       | Total AI deadline; defaults to 120000                                     |
| `AI_REQUESTS_PER_MINUTE`     | No       | Per-user AI starts per process; defaults to 10                            |
| `AI_MAX_CONCURRENT_REQUESTS` | No       | Concurrent AI streams per process; defaults to 8                          |
| `HOST`                       | No       | API bind address; defaults to `127.0.0.1`, image defaults to `0.0.0.0`    |
| `LOG_FORMAT`                 | No       | `text` (default) or `json`                                                |
| `APP_VERSION`                | No       | Release identifier in AI logs and eval reports; defaults to `development` |

`OPENAI_API_KEY` may be empty during local setup. The application and database
still run; only the AI playground is unavailable.

## Architecture

```text
Web -> tRPC -> project domain -> database access -> PostgreSQL
Web -> /api/ai/stream -> inference package -> OpenAI-compatible endpoint
Authenticated caller -> /api/ai/projects -> project-agent domain -> model + project read tool
Web -> /api/auth/* -> Better Auth -> PostgreSQL
```

Business logic lives in `packages/trpc/src/domain`. Database queries live in
`packages/trpc/src/database/access`. HTTP adapters stay in `apps/api`.
See [the engineering blueprint](docs/blueprint.md) for frontend boundaries,
stream semantics, operational limits and AI development principles.

To use a gateway, set its `/v1` URL and key above. Current modelgate also needs
`OPENAI_TOKEN_LIMIT_FIELD=max_tokens` and separately configured end users/use cases.
No sibling checkout or gateway deployment is required for the default setup.

## Commands

```bash
just dev          # start PostgreSQL, migrate, API and web
just db           # start PostgreSQL only
just db-reset     # recreate the local database and migrate
just db-down      # stop PostgreSQL
just check        # typecheck, lint, tests and web build
just check-integration # database-backed integration tests
just check-container # isolated production image, migrations and auth/CRUD smoke test
npm run format       # Oxfmt
npm run format:check
npm run test:web
npm run eval:ai -- --live # two paid model calls; not part of normal checks
npm run db:generate
npm run db:migrate
```

## Adding a feature

For a database-backed feature, add the schema, access functions, domain
operations, contracts, router, then frontend query/mutations. Keep ownership
checks in the server and use `protectedProcedure` for authenticated routes.

For a model feature, reuse the provider configuration in `packages/inference/src/provider.ts`.
Keep text streaming in `packages/inference/src/index.ts` and orchestration in `packages/inference/src/agent.ts`.
Update the browser-safe `packages/inference/src/contracts.ts`, HTTP adapter,
frontend reader and tests together when changing stream events.

### AI development

For model features, follow the [AI development principles](docs/blueprint.md#ai-development-principles)
and their topic guides. Each guide explains the reason, implementation, usage and tests.
The playground uses the text endpoint. The project-agent endpoint is a separate,
authenticated POST accepting the same `{ "prompt": "..." }` body and NDJSON contract.
It reads a project by ID; it cannot create, rename or delete projects.
See [the tool guide](docs/ai/tools.md) for a request example.

The example uses Chat Completions function calls and requires model/gateway support.
It runs calls sequentially and buffers the final answer. It has no persisted memory,
write approvals or multiagent coordination. Its input-token accounting uses an estimate,
not an exact provider tokenizer or a hard spending ledger.

## Production boundary

The API can run in any Node 24 environment with PostgreSQL. Build the web app
with `npm run build:web` and deploy `apps/web/dist` to a static host that
proxies `/api` to the API. No cloud provider is assumed.

Run `npm run db:migrate` against the target production database before starting
the API. This uses only production dependencies and runs inside the API image.
Generate SQL locally with development-only `drizzle-kit`. Never use `just db-reset`
against production. The new forward migration adds only a project listing index.

The AI limiter is per process: one active request per user, bounded starts per
minute and bounded total concurrency. Use one API process for these limits; add
shared gateway quotas and a real spending cap before scaling out or exposing
paid inference through public signup. Missing usage on cancelled streams is
unknown cost, not zero. The starter neither bills users nor estimates prices.

The container check creates and removes its own temporary PostgreSQL container
and network. It does not use your local `.env` or existing database.
