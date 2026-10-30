import assert from "node:assert/strict";
import test from "node:test";
import {
  createReleaseManifest,
  createEvaluationEvidence,
  requireReleaseIdentity,
} from "../release.ts";
import { contentDigest } from "../digest.ts";

const input = {
  appVersion: "release-1",
  sourceRevision: "a".repeat(40),
  artifactDigest: "sha256:" + "b".repeat(64),
  model: "test-model",
  providerConfigId: "provider-1",
  prompt: { version: "prompt-v1", instructions: "SECRET instructions" },
  policy: { version: "policy-v1", limits: { maxToolCalls: 2, timeoutMs: 100 } },
  tools: [{ name: "read", parameters: { id: "string" } }],
};

test("release identities bind build and behavioral configuration without exporting content", () => {
  const release = createReleaseManifest(input);
  requireReleaseIdentity(release);
  assert.equal(contentDigest({ b: 2, a: 1 }), contentDigest({ a: 1, b: 2 }));
  assert.deepEqual(createReleaseManifest(input), release);
  for (const change of [
    { appVersion: "release-2" },
    { sourceRevision: "c".repeat(40) },
    { artifactDigest: "sha256:" + "d".repeat(64) },
    { model: "other" },
    { providerConfigId: "other" },
    { prompt: { ...input.prompt, instructions: "changed" } },
    { policy: { ...input.policy, limits: { maxToolCalls: 3, timeoutMs: 100 } } },
    { tools: [] },
  ])
    assert.notEqual(createReleaseManifest({ ...input, ...change }).release_id, release.release_id);
  assert.doesNotMatch(JSON.stringify(release), /SECRET|instructions|parameters/);
  assert.throws(() =>
    requireReleaseIdentity(createReleaseManifest({ ...input, artifactDigest: undefined })),
  );
  assert.throws(() =>
    requireReleaseIdentity(createReleaseManifest({ ...input, sourceRevision: undefined })),
  );
  assert.throws(() =>
    requireReleaseIdentity(createReleaseManifest({ ...input, appVersion: "development" })),
  );
});

test("evaluation evidence binds the full report to release, dataset and scorer", () => {
  const release = createReleaseManifest(input);
  const dataset = { digest: contentDigest(["case-1"]), scorer_version: "v1", repeats: 2 };
  const report = { passed: 2, total: 2, cases: [{ id: "case-1", status: "passed" }] };
  const evidence = createEvaluationEvidence(release, dataset, report);
  assert.equal(evidence.evidence_id, contentDigest({ release, dataset, report }));
  assert.notEqual(
    createEvaluationEvidence(release, { ...dataset, scorer_version: "v2" }, report).evidence_id,
    evidence.evidence_id,
  );
  assert.notEqual(
    createEvaluationEvidence(release, dataset, { ...report, passed: 1 }).evidence_id,
    evidence.evidence_id,
  );
});
