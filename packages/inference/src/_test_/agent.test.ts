import assert from "node:assert/strict";
import test from "node:test";
import { buildContext } from "../context.ts";

test("context construction is deterministic, preserves source data and rejects overflow", () => {
  const input = {
    instructions: "Only read records.",
    messages: [
      { role: "user" as const, content: "Read record-a" },
      {
        role: "tool" as const,
        tool_call_id: "call-a",
        content: '{"source":"record:record-a","name":"Atlas"}',
      },
    ],
    tools: [
      {
        type: "function" as const,
        function: {
          name: "read_record",
          description: "Read.",
          parameters: {},
          strict: true as const,
        },
      },
    ],
    maxInputTokens: 16_000,
  };
  const context = buildContext(input);
  assert.deepEqual(context, buildContext(input));
  assert.equal(context.messages[0].role, "system");
  assert.match(context.messages[2].content!, /record:record-a/);
  assert.equal(input.messages.length, 2);
  assert.throws(() => buildContext({ ...input, maxInputTokens: 1 }), /input allowance/);
  assert.throws(
    () =>
      buildContext({
        ...input,
        messages: [{ role: "tool", content: "x".repeat(20_000), tool_call_id: "call-a" }],
      }),
    /input allowance/,
  );
});
