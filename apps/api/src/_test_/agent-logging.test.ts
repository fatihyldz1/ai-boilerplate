import assert from "node:assert/strict";
import test from "node:test";
import { invalidateEnvForTesting } from "@app/config/env";
import { runAgent, readTool, type AgentEvent } from "@app/inference/agent";
import { createAIStreamHandler } from "../ai-stream.ts";

test("HTTP logs preserve runtime events without publishing internal events", async (t) => {
  const previous = process.env.LOG_FORMAT;
  process.env.LOG_FORMAT = "json";
  invalidateEnvForTesting();
  t.after(() => {
    if (previous === undefined) delete process.env.LOG_FORMAT;
    else process.env.LOG_FORMAT = previous;
    invalidateEnvForTesting();
  });
  const lines: string[] = [];
  t.mock.method(console, "log", (line: string) => lines.push(line));
  const events: AgentEvent[] = [];
  let turns = 0;
  const handler = createAIStreamHandler(
    async () => ({ user: { id: "user-a" } }),
    async function* (input) {
      const result = await runAgent({
        prompt: input.prompt,
        instructions: "Read.",
        tools: [
          readTool({
            name: "read",
            description: "Read.",
            parameters: {},
            parse: () => undefined,
            execute: async () => "SECRET tool result",
          }),
        ],
        model: async () =>
          ++turns === 1
            ? {
                text: null,
                calls: [
                  { id: "SECRET", type: "function", function: { name: "read", arguments: "{}" } },
                ],
              }
            : { text: "public answer", calls: [] },
        limits: {
          timeoutMs: 1000,
          maxModelCalls: 2,
          maxToolCalls: 1,
          maxTokens: 20_000,
          maxInputTokens: 8000,
          maxOutputTokens: 100,
        },
        onEvent: (event) => {
          events.push(event);
          input.onEvent?.(event);
        },
      });
      yield { type: "complete", text: result.text };
    },
  );
  const body = await (
    await handler(
      new Request("http://localhost/api/ai/projects", {
        method: "POST",
        headers: { "X-Request-ID": "event-contract", "Content-Type": "application/json" },
        body: '{"prompt":"SECRET prompt"}',
      }),
    )
  ).text();
  const execution = lines
    .map((line) => JSON.parse(line))
    .filter((record) => record.event.startsWith("agent_"));
  assert.equal(execution.length, events.length);
  events.forEach((event, index) => {
    const { event_type, ...fields } = event;
    assert.equal(execution[index].event, event_type);
    assert.equal(execution[index].request_id, "event-contract");
    for (const [key, value] of Object.entries(fields)) assert.equal(execution[index][key], value);
  });
  assert.doesNotMatch(lines.join(), /SECRET|public answer/);
  assert.doesNotMatch(body, /agent_finished|tool_name|reason_code/);
  assert.equal(JSON.parse(body).type, "complete");
});
