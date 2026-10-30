# Task-wide execution budgets

## Why this code exists

Per-call limits do not bound a loop that starts more calls.
The single-agent runner therefore owns one budget for its entire model/tool sequence.
The text endpoint keeps its existing single-call behavior.

## Implementation

[`createTaskBudget`](../../packages/inference/src/budget.ts) maintains synchronous reservations shared by one task.
It combines the caller's cancellation signal with an absolute deadline.
`reserveModel` counts a model call and reserves estimated input plus the maximum output allowance before execution.
`reserveTool` counts a tool call before execution.
Reservations happen before awaiting work, so concurrent callers cannot reuse the same allowance.

```ts
const reservation = budget.reserveModel(context.estimatedInputTokens, input.limits.maxOutputTokens);
// Invoke the model with the task signal and output bound.
reservation.settle(turn.usage);
```

Known usage replaces the reserved token amount. Missing usage retains the full reservation.
A reservation can settle only once. Failed model calls keep their reservation.
If reported usage exceeds the remaining task allowance, the task fails before scheduling another call.
The input estimate is not exact provider tokenization, so this is not a hard token or money guarantee.
Use shared gateway quotas and budgets for spending enforcement.

[`runAgent`](../../packages/inference/src/agent.ts) executes model and tool steps sequentially.
It builds [context](context.md) for each model step and stores history only for that run.
It has no automatic retries, parallel execution, persistent tasks or multiagent coordination.
Add those only for a concrete requirement; an agent-count increase needs measured benefits in [evaluation](evaluation.md).

Callers supply maximum model/tool counts, token allowances and a task deadline through the typed limits interface.
The input allowance and output cap apply per call; the total token allowance applies to the whole run.

The runtime is a separate module from the model adapter and HTTP transport.
Callers supply the allowed tools, execution policy and model-step function.

## Completion and cancellation

[`ai-stream.ts`](../../apps/api/src/ai-stream.ts) distinguishes completion, failure, cancellation, timeout and `budget_exhausted` in logs.
All failure paths retain the existing public `error` event instead of inventing a new stream protocol.
A normal model answer still requires separate task correctness checks.

`withSignal` stops awaiting an uncooperative operation when the task is cancelled.
The runtime stops scheduling and passes the signal to model and tool implementations.
Cancellation is cooperative: an implementation that ignores its signal may still finish in the background.
The HTTP handler releases admission once on each terminal path.
Cancellation cannot undo committed external effects. Define reconciliation before adding write tools.

## Verification

[`agent.test.ts`](../../packages/inference/src/_test_/agent.test.ts) covers token/call exhaustion, atomic reservations, missing usage and cancellation.
It tests deadline expiry even when an operation ignores the signal.
[`server.test.ts`](../../apps/api/src/_test_/server.test.ts) checks HTTP disconnects, timeout and admission release.

```bash
node --test packages/inference/src/_test_/agent.test.ts apps/api/src/_test_/server.test.ts
```
