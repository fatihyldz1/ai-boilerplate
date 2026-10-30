import { createTaskBudget, withSignal, type TaskLimits } from "./budget.ts";
import { buildContext, type AgentMessage, type ToolCall, type ToolDefinition } from "./context.ts";
import type { TokenUsage } from "./contracts.ts";
import { InferenceError } from "./errors.ts";

export type AgentTool = {
  definition: ToolDefinition;
  execute: (argumentsValue: unknown, signal: AbortSignal) => Promise<string>;
};

export function readTool<T>(input: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  parse: (value: unknown) => T;
  execute: (value: T, signal: AbortSignal) => Promise<string>;
}): AgentTool {
  return {
    definition: {
      type: "function",
      function: {
        name: input.name,
        description: input.description,
        parameters: input.parameters,
        strict: true,
      },
    },
    async execute(value, signal) {
      signal.throwIfAborted();
      return await input.execute(input.parse(value), signal);
    },
  };
}

export type AgentTurn = { text: string | null; calls: ToolCall[]; usage?: TokenUsage };
export type AgentModel = (
  context: ReturnType<typeof buildContext>,
  options: { signal: AbortSignal; maxOutputTokens: number },
) => Promise<AgentTurn>;
export type AgentStep = {
  step_id: number;
  step_type: "model" | "tool";
  duration_ms: number;
  outcome: "complete" | "error";
};

export async function runAgent(input: {
  prompt: string;
  instructions: string;
  tools: AgentTool[];
  model: AgentModel;
  limits: TaskLimits & { maxInputTokens: number; maxOutputTokens: number };
  signal?: AbortSignal;
  onStep?: (step: AgentStep) => void;
}) {
  const budget = createTaskBudget(input.limits, input.signal);
  const definitions = input.tools.map((tool) => tool.definition);
  const tools = new Map(input.tools.map((tool) => [tool.definition.function.name, tool]));
  if (tools.size !== input.tools.length) {
    budget.close();
    throw new InferenceError("Duplicate AI tool names.");
  }
  const messages: AgentMessage[] = [{ role: "user", content: input.prompt }];
  let stepId = 0;
  let usageKnown = true;
  let costKnown = true;
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

  async function step<T>(type: AgentStep["step_type"], work: () => Promise<T>) {
    const id = ++stepId;
    const startedAt = performance.now();
    let outcome: AgentStep["outcome"] = "error";
    try {
      const result = await withSignal(budget.signal, work);
      budget.check();
      outcome = "complete";
      return result;
    } finally {
      input.onStep?.({
        step_id: id,
        step_type: type,
        duration_ms: performance.now() - startedAt,
        outcome,
      });
    }
  }

  try {
    while (true) {
      budget.check();
      const context = buildContext({
        instructions: input.instructions,
        messages,
        tools: definitions,
        maxInputTokens: input.limits.maxInputTokens,
      });
      const reservation = budget.reserveModel(
        context.estimatedInputTokens,
        input.limits.maxOutputTokens,
      );
      const turn = await step("model", () =>
        input.model(context, {
          signal: budget.signal,
          maxOutputTokens: input.limits.maxOutputTokens,
        }),
      );
      reservation.settle(turn.usage);
      if (turn.usage) {
        usage.inputTokens += turn.usage.inputTokens;
        usage.outputTokens += turn.usage.outputTokens;
        usage.totalTokens += turn.usage.totalTokens;
        if (turn.usage.costUsd === undefined) costKnown = false;
        else usage.costUsd! += turn.usage.costUsd;
      } else usageKnown = false;
      if (!turn.calls.length) {
        if (!costKnown) delete usage.costUsd;
        return { text: turn.text ?? "", usage: usageKnown ? usage : undefined };
      }
      messages.push({ role: "assistant", content: turn.text, tool_calls: turn.calls });
      for (const call of turn.calls) {
        budget.reserveTool();
        const tool = tools.get(call.function.name);
        if (!tool) throw new InferenceError("The model requested an unavailable tool.");
        const content = await step("tool", () =>
          tool.execute(JSON.parse(call.function.arguments), budget.signal),
        );
        messages.push({ role: "tool", content, tool_call_id: call.id });
      }
    }
  } finally {
    budget.close();
  }
}
