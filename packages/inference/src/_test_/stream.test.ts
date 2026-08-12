import assert from "node:assert/strict";
import test from "node:test";

test("inference package exposes the starter stream contract", async () => {
  const module = await import("../index.ts");
  assert.equal(typeof module.streamText, "function");
});
