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
