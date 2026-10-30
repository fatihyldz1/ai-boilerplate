# Versioned observability

## Why this code exists

A duration or error count alone cannot identify which prompt or deployment changed behavior.
Version identifiers make comparisons possible without storing user content.
Step records distinguish model work from tool work without introducing a hosted tracing dependency.

## Implementation

[`ai-stream.ts`](../../apps/api/src/ai-stream.ts) attaches version metadata to AI records:

- `app_version` comes from `APP_VERSION`, with `development` as the local default.
- `prompt_version` identifies the text or project-agent instructions.
- `model` identifies the configured model.
- `provider_config_id` hashes the base URL, token-limit field and output limit, not the API key.

[`provider.ts`](../../packages/inference/src/provider.ts) computes the configuration identifier.
[`logging.ts`](../../apps/api/src/logging.ts) supplies the shared request ID and structured output.
Neither identifier establishes ownership or grants permission.
Use a stable release identifier in deployments and bump prompt versions when instructions change.
Project-agent logs also carry `release_id`, derived from the shared runtime definition
and configured artifact identity. The [release guide](releases.md) explains how to
retain the corresponding manifest and evaluation evidence without capturing content.

The handler records the first nonempty public text delta separately from completion:

```ts
if (event.type === "text-delta" && event.delta.length && firstTokenMs === null) {
  firstTokenMs = performance.now() - startedAt;
}
```

`startedAt` is AI execution start after authentication, input validation and admission.
`first_token_ms` is null if no text arrives. Empty deltas do not count.
The project-agent endpoint buffers its answer, so this measures final-answer latency there.
It is not a measurement of that provider's first generated token.

[`runAgent`](../../packages/inference/src/agent.ts) emits the [shared execution events](events.md) through `onEvent`.
The request ID identifies the task; numbered `step_id` values identify model and tool steps.
A step records its type, registered tool name, duration, outcome and structured reason, not its arguments or result.
`agent_finished` records the runtime's terminal reason, including failures before another step can start.
The enclosing `ai_finished` record distinguishes completion, error, timeout, cancellation and budget exhaustion.
Completion still means inference completion, not semantic task success.

The [operational reference](../blueprint.md#admission-and-observability) defines log restrictions and unknown-cost behavior.
Keep identifiers out of metric labels to avoid unbounded label cardinality.
Choose alert thresholds from observed traffic and assign owners before configuring alerts.
The starter has no hosted collector or automatic alert delivery.

## Use it

```bash
APP_VERSION=release-2026.10 LOG_FORMAT=json just dev-api
```

Filter records by `request_id`, then compare prompt, release and provider configuration identifiers.
Raw prompts, answers, tool arguments and credentials remain outside these logs.

## Regression scenarios

1. Identify a failure through permitted telemetry or explicit user feedback.
2. Reproduce it with synthetic or authorized data. Remove sensitive data before storing a candidate scenario.
3. Require human review of the data and expected behavior.
4. Add the approved scenario to the [behavioral evaluation suite](evaluation.md).
5. Evaluate the candidate against the same dataset/scorer and retain its [release evidence](releases.md).

Keep raw traces out of fixtures. This process does not authorize collecting raw content in production logs.

## Verification

[`logging.test.ts`](../../apps/api/src/_test_/logging.test.ts) checks versions, execution metadata, first-text timing and content exclusion.
[`server.test.ts`](../../apps/api/src/_test_/server.test.ts) checks timeout, cancellation and reservation release.

```bash
node --test apps/api/src/_test_/logging.test.ts apps/api/src/_test_/server.test.ts
```

Regression review is a manual process. There is no automatic content capture or trace-to-fixture exporter.
