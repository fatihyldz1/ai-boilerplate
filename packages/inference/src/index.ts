import { env } from "@app/config/env";
import type { AgentStep } from "./agent.ts";
import type { AIStreamEvent } from "./contracts.ts";
import { InferenceError } from "./errors.ts";
import { createProvider, parseUsage, providerHeaders, tokenLimit } from "./provider.ts";

export { BudgetError, InferenceError } from "./errors.ts";
export { providerConfigId } from "./provider.ts";
export const TEXT_PROMPT_VERSION = "text-v1";

export type StreamTextInput = {
  prompt: string;
  abortSignal?: AbortSignal;
  userId?: string;
  requestId?: string;
  onStep?: (step: AgentStep) => void;
};

export async function* streamText(input: StreamTextInput): AsyncGenerator<AIStreamEvent> {
  const client = createProvider();
  const stream = await client.chat.completions.create(
    {
      model: env.OPENAI_MODEL,
      messages: [{ role: "user", content: input.prompt }],
      stream: true,
      stream_options: { include_usage: true },
      ...tokenLimit(env.AI_MAX_OUTPUT_TOKENS),
    },
    {
      signal: input.abortSignal,
      headers: providerHeaders(input),
    },
  );

  let text = "";
  let finishReason: string | null = null;
  try {
    for await (const chunk of stream) {
      input.abortSignal?.throwIfAborted();
      if (chunk.usage) {
        yield { type: "usage", usage: parseUsage(chunk.usage) };
      }
      const choice = chunk.choices.find((item) => item.index === 0);
      if (choice?.delta.content) {
        text += choice.delta.content;
        yield { type: "text-delta", delta: choice.delta.content };
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    }
    input.abortSignal?.throwIfAborted();
    if (finishReason === "length")
      throw new InferenceError("The answer reached its output limit. Try a shorter request.");
    if (finishReason !== "stop")
      throw new InferenceError("The model stopped before completing the answer.");
    yield { type: "complete", text };
  } finally {
    stream.controller.abort();
  }
}
