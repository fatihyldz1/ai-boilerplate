# Release and evaluation evidence

## Why this code exists

An application label does not identify the prompt, tool schema or execution limits
that produced a result. Evaluation evidence must identify the candidate, dataset
and scorer together before it can support a release decision.

## Implementation

[`projectAgentRelease`](../../packages/trpc/src/domain/project-agent-definition.ts)
uses the same instructions, tool definition and policy as production and evaluations.
[`release.ts`](../../packages/inference/src/release.ts) records application version,
source revision, artifact digest, model, provider configuration ID, prompt version/digest,
policy version/digest and tool-schema digest. SHA-256 `release_id` identifies this manifest.

Content digests recursively sort object keys and preserve array order. They export no
instructions or arguments. Hashes are identifiers, not encryption; never hash secrets
as a substitute for protecting them. Credentials are not manifest inputs.

[`eval-agent.ts`](../../scripts/eval-agent.ts) binds that manifest to the dataset digest,
scorer version, repeat count and full report. `evidence_id` hashes the combined record,
including failed/error cases. [`ai-stream.ts`](../../apps/api/src/ai-stream.ts) attaches
the same `release_id` to project-agent execution, completion and admission logs.

## Use it

Inspect the manifest without model calls:

```bash
npm run eval:agent -- --manifest
```

For release evaluation, the build/deployment pipeline supplies:

| Variable              | Contract                                                        |
| --------------------- | --------------------------------------------------------------- |
| `APP_VERSION`         | Stable release label, not `development`                         |
| `APP_SOURCE_REVISION` | Full lowercase 40- or 64-character Git revision                 |
| `APP_ARTIFACT_DIGEST` | `sha256:` followed by the actual artifact's 64-character digest |

Execute from the candidate artifact or a build verified by the pipeline to match it,
then retain the emitted JSON as a release artifact:

```bash
npm run --silent eval:agent -- --live --release --repeat 3
```

`--release` rejects missing build identity before paid calls. All cases must pass for
a zero exit code. Local `--live` can omit build identity; its result is exploratory,
not deployment approval. Keep evidence unchanged and compare its `release_id` with
production logs. Review the dataset and scorer, not just the pass count. Passing six
reference cases is not a universal acceptance threshold.
`--silent` suppresses npm's command banner so stdout is a standalone JSON evidence
record suitable for storage by CI. No output file is written by the CLI itself.

## Trust and operating limits

The application validates identity formats, not the truth of CI-supplied labels.
It does not inspect registries, verify the running image, sign attestations or implement
promotion/canary/rollback. The deployment pipeline must verify artifact-to-source
association and retain evidence with access controls. Never relabel another executable
as the tested artifact.
The production API image does not ship the root evaluation scripts. Evaluate in CI
from a build verified to match that image; do not assume these commands run inside it.

A hosted model name can point to changing weights. No model-weight digest or exact
replay guarantee is claimed. Pin model identifiers where available and repeat runs.
A content hash detects changed records; it does not authenticate the producer.

Production failures become reviewed synthetic regressions through the
[observability workflow](observability.md#regression-scenarios). Compare completion,
step/latency budgets and known cost under the same release/dataset; keep unknown usage
visible. Rollout objectives and rollback controls belong to the deployment environment,
not hard-coded reference percentages.

## Verification

```bash
node --test packages/inference/src/_test_/release.test.ts
node --test apps/api/src/_test_/release-logging.test.ts
node --test packages/trpc/src/_test_/project-agent-evaluation.test.ts
```

Tests show build/config changes alter release identity, dataset/scorer/report changes
alter evidence, missing identity prevents paid calls and logs match the evaluated
manifest. Fake providers make no external requests.
