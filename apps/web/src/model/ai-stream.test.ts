import assert from "node:assert/strict";
import test from "node:test";
import { initialAIState, reduceAIStream } from "./ai-stream.ts";

test("AI state resets per run, uses final text, and preserves partial output on failure or cancellation", () => {
  const started = reduceAIStream(initialAIState, { type: "start" });
  const partial = reduceAIStream(started, {
    type: "event",
    event: { type: "text-delta", delta: "partial" },
  });
  assert.equal(partial.streaming, true);
  const failed = reduceAIStream(partial, { type: "failed", message: "Truncated." });
  assert.equal(failed.text, "partial");
  assert.equal(failed.error, "Truncated.");
  assert.equal(failed.streaming, false);
  assert.equal(reduceAIStream(partial, { type: "stopped" }).text, "partial");
  assert.equal(
    reduceAIStream(partial, { type: "event", event: { type: "complete", text: "final" } }).text,
    "final",
  );
  assert.deepEqual(reduceAIStream(failed, { type: "start" }), started);
});
