# Behavioral evaluation

## Why this code exists

A normally finished inference can contain an incorrect answer. A correct-looking
answer can hide a wrong tool, wrong arguments or repeated reads. Evaluate both
the result and its execution path, separately from transport completion.

## Implementation

[`runEvaluation`](../../packages/inference/src/evaluation.ts) executes each scenario
and scorer. Cases record `passed`, `failed` or `error`; execution and scoring errors
remain distinct and in the denominator. Typed outputs can carry the same
[execution events](events.md) used in production. `EvaluationExecutionError`
preserves safe events when an execution throws.

Reports include identifiers, durations, available usage and execution metadata,
but omit inputs, answers, lookup arguments and raw errors. Missing usage is unknown,
not zero cost. Scorers can inspect synthetic arguments in memory without exporting them.

| Suite         | Code                                                           | Checks                                                                                   |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Text          | [scenarios.ts](../../packages/inference/evals/scenarios.ts)    | Exact-word output and structured extraction                                              |
| Project agent | [project-agent.ts](../../packages/trpc/evals/project-agent.ts) | Authorized read, missing ID, untrusted name, write refusal, foreign and missing projects |

The agent suite shares production instructions, strict tool schema, output projection
and limits from [project-agent-definition.ts](../../packages/trpc/src/domain/project-agent-definition.ts).
It runs the real runtime/model adapter with an injected synthetic project reader.
No database or account is needed. Integration tests still verify real SQL ownership;
a fixture reader is not evidence that production authorization works.

Read cases require exactly `model -> get_project -> model -> completed`, the right
lookup identity/ID, exact synthetic name and source. Missing-ID and write cases
require no tools. Foreign/missing cases require one failed read and no returned data.
Expected not-found behavior passes its scenario despite the runtime error outcome.
Other execution failures remain evaluation errors.

Structured response requests make these reference assertions objective. They do not
measure general conversational quality or prove universal prompt-injection resistance.
The reviewed dataset digest covers inputs, fixtures, expectations and scorer version.
Scorer functions are not serialized; bump their version when their meaning changes.

## Run it

```bash
npm run eval:ai -- --live
npm run eval:agent -- --live
npm run eval:agent -- --live --repeat 3
```

The text command makes two paid calls. Each agent repeat runs six cases and can make
up to eighteen paid calls within the normal task limits. `--repeat` accepts 1–20;
the default is one. Commands require explicit `--live`; invalid flags fail before
model calls. SDK retries remain disabled.

Each repeat starts fresh context and fixture state. Reports retain every repetition,
including errors. Commands exit nonzero if any case fails or errors. Normal checks
test the suite/CLI against scripted models and fake HTTP providers, never paid services.
This CLI evaluates tasks, not HTTP authentication; keep integration tests for that path.

For release review, use `--live --release --repeat 3` with build identity configured.
`--manifest` prints identity without calls. The [release guide](releases.md) explains
the manifest, dataset/scorer binding and pipeline responsibilities.

## Extend it

Add initial state, allowed actions and explicit expected behavior for each case.
Check actual arguments, repeated effects, event order and final state for tool tasks.
Use deterministic checks for objective requirements; calibrate human/model judgment
separately when meaning cannot be reduced to an exact contract.

Keep production samples out of fixtures until authorized, sanitized and reviewed
through the [regression process](observability.md#regression-scenarios).
Compare the same dataset and limits across releases. Repeated runs measure
consistency, not correctness for every production input.

## Verification

```bash
node --test packages/inference/src/_test_/evaluation.test.ts
node --test packages/trpc/src/_test_/project-agent-evaluation.test.ts
just check-integration
```

Tests reject correct-looking answers with absent, repeated or wrongly targeted tools,
retain looping runs as execution errors, check event order and verify CLI opt-in and
repetition limits without live credentials.
