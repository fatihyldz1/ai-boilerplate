# Engineering blueprint

Updated 30 October 2026. This repository's code and tests define current behavior.
The original reference came from Latticus at
`d3f14f2efc842ebfa8a1e2289b5db81d0bc4b553`, compared with this starter's
`0687022` baseline. This is a curated reference, not an automatic source sync.

## Request boundaries

`web -> tRPC -> domain -> database/access -> PostgreSQL`

Use tRPC for application queries and mutations, and authenticated POST NDJSON for
inference. Ownership comes from the session, never a client-supplied user ID.
Missing and foreign project IDs both return `NOT_FOUND`; unexpected server errors
use a generic public message. Access functions accept a database or transaction.

For AI, authenticate before reading JSON. Bound raw input to 128,000 bytes while
reading, including chunked bodies and misleading content lengths. Bound the
prompt separately to 20,000 characters. Return 413 for byte overflow and 400 for
invalid input. The Node bridge preserves repeated cookies, waits for socket
backpressure, catches failures, and cancels upstream work on response disconnect.
Other endpoints retain their own validators; the AI body cap is not a global
HTTP/upload limit.

## Inference contract

`packages/inference/contracts` is browser-safe and owns the shared event union and
NDJSON reader. An event is `text-delta`, `usage`, `complete`, or `error`.
Only `complete` means successful inference completion. EOF before a terminal
event is failure. Malformed records fail explicitly. UTF-8 may span chunks; a
final record needs no newline. Early reader exit cancels and releases its stream.

The text adapter uses one OpenAI SDK configuration in
[`provider.ts`](../packages/inference/src/provider.ts). It accepts an endpoint, key and model.
Direct OpenAI uses `max_completion_tokens`; current modelgate uses `max_tokens`,
selected by `OPENAI_TOKEN_LIMIT_FIELD`. Both share the same stream code. Configure
gateway end users/use cases outside the starter; `X-End-User` identifies the
authenticated user, and `X-Request-ID` correlates requests. Provider keys stay on
the server. SDK retries are disabled to avoid duplicated work or charges.

The configured output-token bound includes reasoning tokens. Normal stop means inference completion.
The text endpoint rejects tool calls, truncation, filtering, errors and missing finish reasons.
Model-connected tools, persisted conversation history and reasoning controls remain outside the starter.
See the [official chat-completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
for token limits, finish reasons and streamed usage semantics.

## Admission and observability

Defaults: 10 AI starts per user per minute, one active request per user, eight
active AI requests per API process, a 120-second deadline and 4,096 output tokens.
The output bound applies per model call.
The per-process limiter retains only current windows (at most 10,000 users).
Concurrency reservations release on completion, failure, cancellation or timeout.

These are bounded abuse guards, not a monthly spending ledger. Run one API
process for their advertised limits. Before adding replicas or relying on a hard
money cap, enforce shared quotas and budgets at the gateway. Public signup also
requires an application-specific abuse policy before exposing paid inference.

Logs contain request IDs, status/response time, transport completion time, AI
outcome, user/model IDs and reported usage/cost. They exclude request bodies,
query strings, cookies, credentials and raw provider errors. `http_response`
measures response creation; `http_finished` measures transport completion;
`ai_finished` records inference outcome. `ai_denied` records admission rejection.
AI records also contain `app_version`, `prompt_version` and a `provider_config_id`
derived from non-secret configuration. `first_token_ms` measures AI execution start
after admission to the first nonempty public text delta; it is null without text.
The handler accepts numbered step metadata through its injected callback.
Budget rejection records `budget_exhausted`, distinct from ordinary inference errors.
Interrupted streams may not report usage: `usage_known=false` means unknown,
not zero cost. Cost is logged only when the gateway supplies it; the starter does
not estimate prices or perform billing reconciliation.

Use these events to detect failures, rejection bursts, unexpected cancellations,
timeouts and missing usage. Choose operational alert thresholds from real traffic;
no hosted monitoring or alert delivery is configured by this starter.

## AI development principles

Each guide pairs a design decision with working code, usage and verification.
The linked documents describe the implemented building blocks and their limits.

| Design decision                                               | Implementation                                                                                              | Reason and tests                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Measure task correctness separately from inference completion | [`runEvaluation`](../packages/inference/src/evaluation.ts), [`eval:ai`](../scripts/eval-ai.ts)              | [Behavioral evaluation](ai/evaluation.md)      |
| Compare versions without logging content                      | [`ai-stream.ts`](../apps/api/src/ai-stream.ts), [`logging.ts`](../apps/api/src/logging.ts)                  | [Versioned observability](ai/observability.md) |
| Bound the whole task, not only each call                      | [`runAgent`](../packages/inference/src/agent.ts), [`createTaskBudget`](../packages/inference/src/budget.ts) | [Task-wide execution budgets](ai/execution.md) |
| Assemble bounded context from explicit inputs                 | [`buildContext`](../packages/inference/src/context.ts)                                                      | [Model context](ai/context.md)                 |

## Frontend boundaries

- Pages select route entry points. Keep the public landing page eager; lazy-load
  authenticated and auth pages through route boundaries.
- Containers connect queries/actions to views. Hooks own request lifecycle,
  cancellation, state and effects; a wrapper for every tRPC procedure is unnecessary.
- Components render props and emit events. Local form and visual state is allowed.
- `data` performs transport; `model` owns pure transformations. Import concrete
  modules directly. Oxlint enforces component/model boundaries and hook rules.

React 18 is retained without React Compiler. Oxfmt owns formatting. UI packages,
Markdown workers, canvas rendering and manual chunking are not required here.

## Database and delivery

Drizzle schemas are the source of SQL names and inferred row types. Preserve
existing identifiers during refactors. The project owner/creation-time index
supports the example's user-filtered listing. Existing cross-user isolation and
transaction rollback tests protect the example boundary.

Generate migrations with development-only `drizzle-kit`. Apply committed SQL
through `packages/trpc/scripts/db-migrate.ts` using runtime dependencies only.
Run migrations before starting a new API release; do not reset a production DB.
The container check uses an isolated disposable PostgreSQL instance, applies
migrations twice, then exercises auth and protected tRPC using the production image.
Review migration locking/compatibility and backups for a real production rollout.

CI keeps type checks, lint, formatting, frontend build, unit tests, DB integration
tests and the production-container smoke check. Provider tests use a local fake
HTTP server. No real AI credentials or paid calls are required.

## Deliberate exclusions

Canvas/branch DAGs, claims, MCP, skills, organizations, billing, pgvector, gateway
deployment and cloud-specific infrastructure are product choices, not blueprint
requirements. The starter's own CI and neutral setup remain independent of
Latticus's single-host deployment and sibling `modelgate` checkout.
