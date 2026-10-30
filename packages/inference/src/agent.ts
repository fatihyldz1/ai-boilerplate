import { createTaskBudget, withSignal, type TaskLimits } from "./budget.ts";
import { buildContext, type AgentMessage, type ToolCall, type ToolDefinition } from "./context.ts";
import type { TokenUsage } from "./contracts.ts";
import { AgentError } from "./errors.ts";
import { agentFailureReason, type AgentEvent, type AgentReason } from "./agent-events.ts";

export type { AgentEvent } from "./agent-events.ts";

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
      let parsed: T;
      try {
        parsed = input.parse(value);
      } catch {
        throw new AgentError("Invalid AI tool arguments.", "invalid_tool_arguments");
      }
      return await input.execute(parsed, signal);
    },
  };
}

export type AgentTurn = { text: string | null; calls: ToolCall[]; usage?: TokenUsage };
export type AgentModel = (
  context: ReturnType<typeof buildContext>,
  options: { signal: AbortSignal; maxOutputTokens: number },
) => Promise<AgentTurn>;
export async function runAgent(input: {
  prompt: string;
  instructions: string;
  tools: AgentTool[];
  model: AgentModel;
  limits: TaskLimits & { maxInputTokens: number; maxOutputTokens: number };
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}) {
  const startedAt = performance.now();
  let budget: ReturnType<typeof createTaskBudget> | undefined;
  let reason: AgentReason = "completed";
  try {
    budget = createTaskBudget(input.limits, input.signal);
    const taskBudget = budget;
    const definitions = input.tools.map((tool) => tool.definition);
    const tools = new Map(input.tools.map((tool) => [tool.definition.function.name, tool]));
    if (tools.size !== input.tools.length) {
      throw new AgentError("Duplicate AI tool names.", "duplicate_tools");
    }
    const messages: AgentMessage[] = [{ role: "user", content: input.prompt }];
    let stepId = 0;
    let usageKnown = true;
    let costKnown = true;
    const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };

    async function step<T>(type: "model" | "tool", work: () => Promise<T>, toolName?: string) {
      const id = ++stepId;
      const startedAt = performance.now();
      let outcome: "complete" | "error" = "error";
      let reasonCode: AgentReason = "step_completed";
      try {
        const result = await withSignal(taskBudget.signal, work);
        taskBudget.check();
        outcome = "complete";
        return result;
      } catch (error) {
        reasonCode = agentFailureReason(error, taskBudget.signal);
        throw error;
      } finally {
        input.onEvent?.({
          event_type: "agent_step_finished",
          step_id: id,
          step_type: type,
          ...(toolName ? { tool_name: toolName } : {}),
          duration_ms: performance.now() - startedAt,
          outcome,
          reason_code: reasonCode,
        });
      }
    }

    while (true) {
      taskBudget.check();
      const context = buildContext({
        instructions: input.instructions,
        messages,
        tools: definitions,
        maxInputTokens: input.limits.maxInputTokens,
      });
      const reservation = taskBudget.reserveModel(
        context.estimatedInputTokens,
        input.limits.maxOutputTokens,
      );
      const turn = await step("model", () =>
        input.model(context, {
          signal: taskBudget.signal,
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
        taskBudget.reserveTool();
        const tool = tools.get(call.function.name);
        if (!tool)
          throw new AgentError("The model requested an unavailable tool.", "unavailable_tool");
        const content = await step(
          "tool",
          () => {
            let argumentsValue: unknown;
            try {
              argumentsValue = JSON.parse(call.function.arguments);
            } catch {
              throw new AgentError("Invalid AI tool arguments.", "invalid_tool_arguments");
            }
            return tool.execute(argumentsValue, taskBudget.signal);
          },
          tool.definition.function.name,
        );
        messages.push({ role: "tool", content, tool_call_id: call.id });
      }
    }
  } catch (error) {
    reason = agentFailureReason(error, budget?.signal ?? input.signal);
    throw error;
  } finally {
    budget?.close();
    input.onEvent?.({
      event_type: "agent_finished",
      duration_ms: performance.now() - startedAt,
      outcome: reason === "completed" ? "complete" : "error",
      reason_code: reason,
    });
  }
}
