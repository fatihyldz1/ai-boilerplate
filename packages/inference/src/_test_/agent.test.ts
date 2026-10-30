import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { readTool, runAgent, type AgentModel, type AgentEvent } from "../agent.ts";
import { createTaskBudget, withSignal } from "../budget.ts";
import { buildContext, type ToolCall } from "../context.ts";

const limits = {
  timeoutMs: 1000,
  maxModelCalls: 3,
  maxToolCalls: 2,
  maxTokens: 48_000,
  maxInputTokens: 16_000,
  maxOutputTokens: 100,
};
const usage = { inputTokens: 2, outputTokens: 3, totalTokens: 5 };
function call(name = "read_record", args = '{"id":"record-a"}'): ToolCall {
  return { id: "call-a", type: "function", function: { name, arguments: args } };
}
function tool(
  execute: (id: string) => Promise<string> = async (id) =>
    JSON.stringify({ source: "record:" + id, name: "Atlas" }),
) {
  return readTool({
    name: "read_record",
    description: "Read one authorized record.",
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    parse(value) {
      if (
        !value ||
        typeof value !== "object" ||
        !("id" in value) ||
        typeof value.id !== "string" ||
        Object.keys(value).length !== 1
      )
        throw new Error("Invalid arguments.");
      return value.id;
    },
    execute,
  });
}

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
    tools: [tool().definition],
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

test("task reservations count model calls, reconcile known usage and retain unknown allowances", () => {
  const budget = createTaskBudget({ ...limits, maxTokens: 200, maxModelCalls: 3, maxToolCalls: 1 });
  try {
    budget.reserveModel(50, 50).settle(usage);
    budget.reserveModel(50, 50).settle();
    assert.throws(() => budget.reserveModel(50, 50), /budget exhausted/);
    budget.reserveModel(20, 20).settle(usage);
    assert.throws(() => budget.reserveModel(1, 1), /budget exhausted/);
    budget.reserveTool();
    assert.throws(() => budget.reserveTool(), /tool budget/);
  } finally {
    budget.close();
  }
  assert.throws(() => budget.check(), /already closed/);
});

test("parallel reservations cannot spend the same allowance and settlement is single-use", async () => {
  const budget = createTaskBudget({ ...limits, maxTokens: 100 });
  try {
    const results = await Promise.allSettled([
      Promise.resolve().then(() => budget.reserveModel(30, 30)),
      Promise.resolve().then(() => budget.reserveModel(30, 30)),
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    const reservation = results.find((item) => item.status === "fulfilled")!.value;
    reservation.settle();
    assert.throws(() => reservation.settle(usage), /already settled/);
  } finally {
    budget.close();
  }
});

test("invalid limits and usage fail, including usage above the reserved task total", () => {
  assert.throws(() => createTaskBudget({ ...limits, maxTokens: 0 }), /positive/);
  for (const totalTokens of [-1, NaN, 1001]) {
    const budget = createTaskBudget({ ...limits, maxTokens: 1000 });
    try {
      assert.throws(() => budget.reserveModel(10, 10).settle({ ...usage, totalTokens }));
    } finally {
      budget.close();
    }
  }
});

test("one absolute deadline interrupts work even if it ignores the signal", async () => {
  const budget = createTaskBudget({ ...limits, timeoutMs: 20 });
  try {
    await Promise.all([
      assert.rejects(() => withSignal(budget.signal, () => new Promise(() => {})), /deadline/),
      delay(40),
    ]);
    assert.throws(() => budget.reserveTool(), /deadline/);
  } finally {
    budget.close();
  }
});

test("agent completes a bounded read, preserves tool sources and emits only step metadata", async () => {
  let calls = 0;
  const events: AgentEvent[] = [];
  const model: AgentModel = async (context, options) => {
    assert.equal(options.maxOutputTokens, 100);
    calls += 1;
    if (calls === 1) return { text: null, calls: [call()], usage };
    assert.equal(context.messages.at(-1)?.role, "tool");
    assert.match(context.messages.at(-1)?.content ?? "", /record:record-a/);
    return { text: "Atlas", calls: [], usage };
  };
  const result = await runAgent({
    prompt: "SECRET read record-a",
    instructions: "Read only.",
    tools: [tool()],
    model,
    limits,
    onEvent: (event) => events.push(event),
  });
  assert.equal(result.text, "Atlas");
  assert.deepEqual(result.usage, { inputTokens: 4, outputTokens: 6, totalTokens: 10 });
  assert.deepEqual(
    events
      .filter((event) => event.event_type === "agent_step_finished")
      .map((step) => step.step_type),
    ["model", "tool", "model"],
  );
  assert.equal(
    events[1].event_type === "agent_step_finished" && events[1].tool_name,
    "read_record",
  );
  assert.equal(events.at(-1)?.reason_code, "completed");
  assert.doesNotMatch(JSON.stringify(events), /SECRET|record-a|Atlas/);
});

test("unknown tools and invalid arguments cannot reach a tool implementation", async () => {
  let executed = 0;
  for (const request of [
    call("write_record"),
    call("read_record", "{broken}"),
    call("read_record", '{"id":"record-a","userId":"foreign"}'),
  ]) {
    await assert.rejects(() =>
      runAgent({
        prompt: "read",
        instructions: "Read only.",
        tools: [
          tool(async () => {
            executed += 1;
            return "ok";
          }),
        ],
        model: async () => ({ text: null, calls: [request], usage }),
        limits,
      }),
    );
  }
  assert.equal(executed, 0);
});

test("repeated model tool requests terminate at the task budget", async () => {
  let executed = 0;
  await assert.rejects(
    () =>
      runAgent({
        prompt: "loop",
        instructions: "Read only.",
        tools: [
          tool(async () => {
            executed += 1;
            return "ok";
          }),
        ],
        model: async () => ({ text: null, calls: [call()], usage }),
        limits,
      }),
    /tool budget/,
  );
  assert.equal(executed, 2);
});

test("cancellation reaches an active tool and prevents a following model call", async () => {
  const controller = new AbortController();
  let modelCalls = 0;
  let toolSignal: AbortSignal | undefined;
  const started = Promise.withResolvers<void>();
  const slow = readTool({
    name: "read_record",
    description: "Read.",
    parameters: {},
    parse: () => undefined,
    execute: async (_value, signal) => {
      toolSignal = signal;
      started.resolve();
      return await new Promise<string>(() => {});
    },
  });
  const result = runAgent({
    prompt: "read",
    instructions: "Read only.",
    tools: [slow],
    signal: controller.signal,
    model: async () => {
      modelCalls += 1;
      return { text: null, calls: [call()], usage };
    },
    limits,
  });
  await started.promise;
  controller.abort(new Error("User cancelled."));
  await assert.rejects(result, /User cancelled/);
  assert.equal(toolSignal?.aborted, true);
  assert.equal(modelCalls, 1);
});

test("unknown usage stays unknown across the complete task and runs do not retain history", async () => {
  let calls = 0;
  const result = await runAgent({
    prompt: "read",
    instructions: "Read only.",
    tools: [tool()],
    model: async () =>
      ++calls === 1 ? { text: null, calls: [call()] } : { text: "Atlas", calls: [], usage },
    limits,
  });
  assert.equal(result.usage, undefined);
  await runAgent({
    prompt: "new run",
    instructions: "Read only.",
    tools: [],
    model: async (context) => {
      assert.equal(context.messages.length, 2);
      assert.equal(context.messages[1].content, "new run");
      return { text: "fresh", calls: [], usage };
    },
    limits,
  });
});
