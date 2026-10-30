import assert from "node:assert/strict";
import test from "node:test";
import { env, invalidateEnvForTesting } from "../env.ts";

function withEnvironment(values: Record<string, string>, callback: () => void) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  invalidateEnvForTesting();

  try {
    callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    invalidateEnvForTesting();
  }
}

test("production authentication secrets require length and non-placeholder values", () => {
  withEnvironment(
    {
      ENVIRONMENT: "production",
      BETTER_AUTH_SECRET: "too-short",
    },
    () => {
      assert.throws(() => env.BETTER_AUTH_SECRET, /at least 32 characters/);
    },
  );

  withEnvironment(
    {
      ENVIRONMENT: "production",
      BETTER_AUTH_SECRET: "generate-a-random-secret-at-least-32-characters",
    },
    () => {
      assert.throws(() => env.BETTER_AUTH_SECRET, /changed in production/);
    },
  );

  withEnvironment(
    {
      ENVIRONMENT: "production",
      BETTER_AUTH_SECRET: "a-valid-production-secret-that-is-long-enough",
    },
    () => {
      assert.equal(env.BETTER_AUTH_SECRET, "a-valid-production-secret-that-is-long-enough");
    },
  );
});

test("AI limits and gateway wire configuration reject invalid values", () => {
  withEnvironment(
    { APP_SOURCE_REVISION: "a".repeat(40), APP_ARTIFACT_DIGEST: "sha256:" + "b".repeat(64) },
    () => {
      assert.equal(env.APP_SOURCE_REVISION, "a".repeat(40));
      assert.equal(env.APP_ARTIFACT_DIGEST, "sha256:" + "b".repeat(64));
    },
  );
  for (const [key, value] of [
    ["APP_SOURCE_REVISION", "main"],
    ["APP_ARTIFACT_DIGEST", "latest"],
  ] as const)
    withEnvironment({ [key]: value }, () => assert.throws(() => env[key]));
  withEnvironment({ APP_VERSION: "release-2026.10" }, () =>
    assert.equal(env.APP_VERSION, "release-2026.10"),
  );
  withEnvironment({ APP_VERSION: "invalid release\nvalue" }, () =>
    assert.throws(() => env.APP_VERSION),
  );
  for (const value of ["0", "-1", "10ms", "1.5", "2147483648"]) {
    withEnvironment({ AI_TIMEOUT_MS: value }, () =>
      assert.throws(() => env.AI_TIMEOUT_MS, /positive 32-bit integers/),
    );
  }
  withEnvironment({ OPENAI_TOKEN_LIMIT_FIELD: "unsupported" }, () =>
    assert.throws(() => env.OPENAI_TOKEN_LIMIT_FIELD),
  );
  for (const value of [
    "file:///tmp/provider",
    "https://user:secret@example.com/v1",
    "https://example.com/v1?token=secret",
  ]) {
    withEnvironment({ OPENAI_BASE_URL: value }, () => assert.throws(() => env.OPENAI_BASE_URL));
  }
  withEnvironment(
    { OPENAI_TOKEN_LIMIT_FIELD: "max_tokens", OPENAI_BASE_URL: "http://localhost:8425/v1" },
    () => {
      assert.equal(env.OPENAI_TOKEN_LIMIT_FIELD, "max_tokens");
      assert.equal(env.OPENAI_BASE_URL, "http://localhost:8425/v1");
    },
  );
});
