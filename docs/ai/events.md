# Agent execution events

## Why this code exists

A final answer cannot explain which tool ran or why execution stopped.
A shared, content-free event contract lets runtime tests, evaluations and production
logs describe the same execution without interpreting provider error messages.
These events explain execution, not whether the answer satisfies the user's task.

## Implementation

[`AgentEvent`](../../packages/inference/src/agent-events.ts) is a server-only union.
[`runAgent`](../../packages/inference/src/agent.ts) emits it through `onEvent`:

| Event                 | Fields                                                                                | Meaning                                  |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `agent_step_finished` | `step_id`, `step_type`, optional `tool_name`, `duration_ms`, `outcome`, `reason_code` | One attempted model/tool operation ended |
| `agent_finished`      | `duration_ms`, `outcome`, `reason_code`                                               | The runtime returned or threw            |

Step IDs increase across both model and tool operations. `tool_name` comes only
from a registered tool, never from an unrecognized model-generated name.
Arguments, call IDs, tool results, prompts, answers and raw errors are not events.
The callback is synchronous and must not throw. It is not a durable event sink.

`step_completed` describes a finished operation; `completed` describes a normally
finished run. A later budget reconciliation can reject a run even after its model
operation completed. Work rejected before invocation has no fabricated step event;
the terminal event explains why no further work started.

Failure codes distinguish `model_calls_exhausted`, `tool_calls_exhausted`,
`token_budget_exhausted`, `context_overflow`, `deadline_exceeded`, `invalid_budget`,
`unavailable_tool`, `invalid_tool_arguments`, `duplicate_tools`, `cancelled` and
`execution_error`. Validation details and provider exceptions stay private.

[`ai-stream.ts`](../../apps/api/src/ai-stream.ts) logs each event under the existing
request ID. `agent_finished` describes runtime completion; `ai_finished` describes
the enclosing inference request. Neither establishes semantic task correctness.
Cancellation of an HTTP response can precede the runtime's final event.

## Use it

```ts
const events: AgentEvent[] = [];
const result = await runAgent({
  ...input,
  onEvent: (event) => events.push(event),
});
```

Tests inspect the same `event_type`, `tool_name` and `reason_code` that production
logs contain. Use approved synthetic fixtures to check actual arguments in memory;
do not expand routine telemetry to capture them.

The browser NDJSON contract is unchanged: `text-delta`, `usage`, `complete`, `error`.
Do not expose these internal execution events or model reasoning to the browser.
See [observability](observability.md) for correlation and privacy rules and
[execution budgets](execution.md) for the controls behind termination codes.

## Verification

```bash
node --test packages/inference/src/_test_/agent-events.test.ts
node --test packages/inference/src/_test_/agent.test.ts apps/api/src/_test_/logging.test.ts
```

The tests cover successful ordering, registered tool names, invalid arguments,
unknown-tool privacy, unscheduled budget failures, deadline/cancellation separation
and one terminal event on each runtime path. Normal checks use no paid model.
