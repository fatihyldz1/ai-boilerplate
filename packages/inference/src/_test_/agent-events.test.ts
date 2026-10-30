import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { runAgent, readTool, type AgentEvent, type AgentModel } from "../agent.ts";

const limits = {
  timeoutMs: 1000,
  maxModelCalls: 2,
  maxToolCalls: 1,
  maxTokens: 20_000,
  maxInputTokens: 8000,
  maxOutputTokens: 100,
};
const call = {
  id: "SECRET",
  type: "function" as const,
  function: { name: "read", arguments: "{}" },
};
const tool = readTool({
  name: "read",
  description: "Read.",
  parameters: {},
  parse: () => undefined,
  execute: async () => "SECRET",
});

test("terminal events explain unscheduled work and never echo unknown names or raw errors", async () => {
  const cases: { reason: string; model: AgentModel; limits?: Partial<typeof limits> }[] = [
    {
      reason: "model_calls_exhausted",
      model: async () => ({ text: null, calls: [call] }),
      limits: { maxModelCalls: 1 },
    },
    { reason: "tool_calls_exhausted", model: async () => ({ text: null, calls: [call] }) },
    {
      reason: "token_budget_exhausted",
      model: async () => ({ text: "", calls: [] }),
      limits: { maxTokens: 1 },
    },
    {
      reason: "context_overflow",
      model: async () => ({ text: "", calls: [] }),
      limits: { maxInputTokens: 1 },
    },
    {
      reason: "invalid_budget",
      model: async () => ({ text: "", calls: [] }),
      limits: { maxModelCalls: 0 },
    },
    {
      reason: "invalid_tool_arguments",
      model: async () => ({
        text: null,
        calls: [{ ...call, function: { name: "read", arguments: "SECRET" } }],
      }),
    },
    {
      reason: "unavailable_tool",
      model: async () => ({
        text: null,
        calls: [{ ...call, function: { name: "SECRET_UNKNOWN_TOOL", arguments: "{}" } }],
      }),
    },
    {
      reason: "execution_error",
      model: async () => {
        throw new Error("SECRET_PROVIDER_ERROR");
      },
    },
  ];
  for (const item of cases) {
    const events: AgentEvent[] = [];
    await assert.rejects(() =>
      runAgent({
        prompt: "SECRET",
        instructions: "Read.",
        tools: [tool],
        model: item.model,
        limits: { ...limits, ...item.limits },
        onEvent: (event) => events.push(event),
      }),
    );
    assert.equal(events.at(-1)?.reason_code, item.reason);
    assert.equal(events.filter((event) => event.event_type === "agent_finished").length, 1);
    assert.doesNotMatch(JSON.stringify(events), /SECRET/);
  }
});

test("deadline and caller cancellation have different terminal reasons", async () => {
  for (const reason of ["deadline_exceeded", "cancelled"]) {
    const events: AgentEvent[] = [];
    const controller = new AbortController();
    const run = runAgent({
      prompt: "read",
      instructions: "Read.",
      tools: [tool],
      model: async () => new Promise(() => {}),
      limits: { ...limits, timeoutMs: reason === "deadline_exceeded" ? 10 : 1000 },
      signal: controller.signal,
      onEvent: (event) => events.push(event),
    });
    if (reason === "cancelled") controller.abort(new Error("SECRET"));
    await Promise.all([assert.rejects(run), delay(30)]);
    assert.equal(events.at(-1)?.reason_code, reason);
    assert.doesNotMatch(JSON.stringify(events), /SECRET/);
  }
});

test("an enclosing HTTP deadline is not mislabeled as user cancellation", async () => {
  const events: AgentEvent[] = [];
  const run = runAgent({
    prompt: "read",
    instructions: "Read.",
    tools: [tool],
    model: async () => new Promise(() => {}),
    limits,
    signal: AbortSignal.timeout(10),
    onEvent: (event) => events.push(event),
  });
  await Promise.all([assert.rejects(run), delay(30)]);
  assert.equal(events.at(-1)?.reason_code, "deadline_exceeded");
});
