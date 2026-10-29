import assert from "node:assert/strict";
import test from "node:test";
import { createAIAdmission } from "../admission.ts";

test("admission enforces concurrency, releases once, and expires per-user rate windows", () => {
  let now = 0;
  const acquire = createAIAdmission({ maxRequests: 1, maxConcurrent: 1, now: () => now });
  const first = acquire("a");
  assert.ok("release" in first);
  assert.ok("retryAfter" in acquire("a"));
  assert.ok("retryAfter" in acquire("b"));
  first.release();
  first.release();
  assert.ok("retryAfter" in acquire("a"));
  const second = acquire("b");
  assert.ok("release" in second);
  second.release();
  now = 60_001;
  const renewed = acquire("a");
  assert.ok("release" in renewed);
  renewed.release();
});
