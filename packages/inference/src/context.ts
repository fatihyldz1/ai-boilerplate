import { BudgetError } from "./errors.ts";

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict: true;
  };
};

export function buildContext(input: {
  instructions: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  maxInputTokens: number;
}) {
  const messages = [{ role: "system" as const, content: input.instructions }, ...input.messages];
  // shortcut: byte estimates include framing headroom; exact limits need a provider-specific tokenizer.
  const estimatedInputTokens =
    new TextEncoder().encode(JSON.stringify({ messages, tools: input.tools })).length +
    256 * (messages.length + input.tools.length + 1);
  if (!Number.isSafeInteger(input.maxInputTokens) || input.maxInputTokens < estimatedInputTokens) {
    throw new BudgetError("AI context exceeds its input allowance.");
  }
  return { messages, tools: input.tools, estimatedInputTokens };
}
