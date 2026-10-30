# Behavioral evaluation

## Why this code exists

A normally finished stream can contain an incorrect answer.
The [stream contract](../blueprint.md#inference-contract) checks delivery, not task correctness.
A separate evaluator lets model changes fail a task check without redefining transport success.

## Implementation

[`runEvaluation`](../../packages/inference/src/evaluation.ts) executes each scenario and then its scorer.
It records `passed`, `failed` or `error` for every case.
Execution errors and scorer errors remain distinct and stay in the denominator.
Reports include scenario versions, application/prompt/model/provider/scorer identifiers, durations and available usage.
They exclude prompts, answers and raw exceptions. Missing usage means unknown, not zero cost.

[`scenarios.ts`](../../packages/inference/evals/scenarios.ts) contains two small reference tasks:
an exact-word response and JSON field extraction.
The exact-word scenario uses this shape:

```ts
{
  id: "exact-word",
  version: "1",
  input: "Reply with exactly READY and nothing else.",
  score: ({ text }) => text.trim() === "READY",
}
```

These scorers test observable output rather than asking the model to grade itself.
They demonstrate the mechanism; they are not a general product quality score.

## Run it

Set the provider credentials and model in `.env`. Set `APP_VERSION` to the release under evaluation.
Then run:

```bash
npm run eval:ai -- --live
```

[`eval-ai.ts`](../../scripts/eval-ai.ts) makes two paid requests through the normal text adapter.
Each request uses the configured timeout and output limit. SDK retries remain disabled.
The command prints a JSON report and exits unsuccessfully if any case fails or errors.
Without `--live`, it exits before making model calls and explains the cost.
Normal `just check` and integration tests never run paid evaluations.

## Extend it

Define initial state and permitted effects in the scenario input for a product task.
Add a deterministic scorer when the result is verifiable.
For tool scenarios, check arguments, repeated effects and resulting application state in a task-specific test.
The reference CLI evaluates text only; database-backed tool checks remain integration tests.
If a criterion requires judgment, calibrate human or model judgments separately from these assertions.

Bump scenario and scorer versions when their meaning changes.
Compare the same scenarios and limits across releases; repeat runs to measure consistency.
Production examples follow the [review process](observability.md#regression-scenarios).

## Verification

[`evaluation.test.ts`](../../packages/inference/src/_test_/evaluation.test.ts) proves that incorrect answers fail and errors remain in reports.
It also verifies the reference scorers against malformed and incorrect outputs.

```bash
node --test packages/inference/src/_test_/evaluation.test.ts
```
