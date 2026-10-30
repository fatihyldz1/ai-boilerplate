import { contentDigest } from "./digest.ts";

export function createReleaseManifest(input: {
  appVersion: string;
  sourceRevision?: string;
  artifactDigest?: string;
  model: string;
  providerConfigId: string;
  prompt: { version: string; instructions: string };
  policy: { version: string; limits: Record<string, number> };
  tools: unknown[];
}) {
  const manifest = {
    schema_version: 1,
    app_version: input.appVersion,
    source_revision: input.sourceRevision ?? null,
    artifact_digest: input.artifactDigest ?? null,
    model: input.model,
    provider_config_id: input.providerConfigId,
    prompt_version: input.prompt.version,
    prompt_digest: contentDigest(input.prompt.instructions),
    policy_version: input.policy.version,
    policy_digest: contentDigest(input.policy.limits),
    tool_schema_digest: contentDigest(input.tools),
  };
  return { ...manifest, release_id: contentDigest(manifest) };
}

export type ReleaseManifest = ReturnType<typeof createReleaseManifest>;

export function requireReleaseIdentity(manifest: ReleaseManifest) {
  if (
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(manifest.source_revision ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(manifest.artifact_digest ?? "") ||
    manifest.app_version === "development"
  )
    throw new Error(
      "Release evaluation requires APP_VERSION, APP_SOURCE_REVISION and APP_ARTIFACT_DIGEST.",
    );
}

export function createEvaluationEvidence<Report extends { total: number; passed: number }>(
  release: ReleaseManifest,
  dataset: { digest: string; scorer_version: string; repeats: number },
  report: Report,
) {
  const evidence = { release, dataset, report };
  return { ...evidence, evidence_id: contentDigest(evidence) };
}
