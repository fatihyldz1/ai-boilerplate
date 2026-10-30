# Authorized tools

## Why this code exists

A model may choose an action, but it cannot choose the acting user or grant permission.
One read-only project tool demonstrates this separation without adding an approval or workflow system.
It reuses the starter's example domain instead of introducing product-specific business logic.

## Implementation

[`projectReadTool`](../../packages/trpc/src/domain/project-agent.ts) closes over the authenticated user ID.
Its strict Zod schema accepts only a project ID. The same schema produces the model's JSON schema.
Extra arguments, including a model-generated `userId`, fail validation.
The shared [`createProjectReadTool`](../../packages/trpc/src/domain/project-agent-definition.ts)
accepts the reader implementation: production supplies the authorized project domain,
while evaluations supply synthetic records. Schema, projection and instructions are
shared; the fixture reader does not replace real database ownership tests.

```ts
async execute({ id }, signal) {
  const project = await Project.getProject({ id, userId });
  signal.throwIfAborted();
  return JSON.stringify({
    source: `project:${project.id}`,
    project: { id: project.id, name: project.name },
  });
}
```

The domain operation enforces ownership through `database/access`.
Missing and foreign projects both produce `NOT_FOUND`.
The tool returns only the ID, name and source reference, not the owner or a full database row.

[`readTool`](../../packages/inference/src/agent.ts) runs validation before the implementation.
`runAgent` checks an explicit tool-name allowlist. Unknown tools terminate the run.
[`agent-model.ts`](../../packages/inference/src/agent-model.ts) advertises strict function schemas and disables parallel tool calls.
Server validation remains necessary even if the provider supports strict schemas.
All calls consume the [task budget](execution.md).

## Use it

Send a request from the signed-in application origin, replacing `PROJECT_ID` with one of your project IDs:

```ts
const response = await fetch("/api/ai/projects", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "Read project PROJECT_ID and tell me its name." }),
});
```

Read the NDJSON body with `readAIStream` from `@app/inference/contracts`.
Only `complete` ends a successful inference stream; HTTP 200 alone is insufficient.
[`project-agent.ts`](../../apps/api/src/project-agent.ts) adapts the domain result to that existing contract.
The model needs [Chat Completions function-call support](https://developers.openai.com/api/docs/guides/function-calling).
The final answer is buffered, not streamed token by token.

## Writes and retries

The reference endpoint has no write tools or approval implementation.
Before adding writes, define which actions require human approval.
Bind approval to the authenticated user, action and validated arguments.
Recheck approval if those arguments change.
Define how repeated requests are identified and how uncertain outcomes are reconciled.
Retry a write only when its idempotency rules prevent duplicate effects.
A disconnect or timeout does not prove that the write failed to commit.

Measure task correctness through [behavioral evaluation](evaluation.md), not the tool's success status alone.

## Verification

- [`agent.test.ts`](../../packages/inference/src/_test_/agent.test.ts) rejects unknown names, invalid arguments and repeated calls beyond the budget.
- [`project.test.ts`](../../packages/trpc/src/_integration_/project.test.ts) checks the real tool's ownership, strict arguments and source references.
- [`server.test.ts`](../../apps/api/src/_integration_/server.test.ts) exercises authentication, the real SDK adapter, tool execution and NDJSON over HTTP.

Run `just check` and `just check-integration`. The integration tests use a fake model provider, not paid calls.
