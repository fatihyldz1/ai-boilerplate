import { env } from "@app/config/env";
import OpenAI from "openai";
import type { AIStreamEvent, TokenUsage } from "./contracts.ts";

export class InferenceError extends Error {
  override name = "InferenceError";
}

export type StreamTextInput = {
  prompt: string;
  abortSignal?: AbortSignal;
  userId?: string;
  requestId?: string;
};

export async function* streamText(input: StreamTextInput): AsyncGenerator<AIStreamEvent> {
  if (!env.OPENAI_API_KEY) throw new InferenceError("AI is not configured.");
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    maxRetries: 0,
    timeout: env.AI_TIMEOUT_MS,
  });
  const stream = await client.chat.completions.create(
    {
      model: env.OPENAI_MODEL,
      messages: [{ role: "user", content: input.prompt }],
      stream: true,
      stream_options: { include_usage: true },
      ...(env.OPENAI_TOKEN_LIMIT_FIELD === "max_tokens"
        ? { max_tokens: env.AI_MAX_OUTPUT_TOKENS }
        : { max_completion_tokens: env.AI_MAX_OUTPUT_TOKENS }),
    },
    {
      signal: input.abortSignal,
      headers: {
        ...(input.userId ? { "X-End-User": input.userId } : {}),
        ...(input.requestId ? { "X-Request-ID": input.requestId } : {}),
      },
    },
  );

  let text = "";
  let finishReason: string | null = null;
  try {
    for await (const chunk of stream) {
      input.abortSignal?.throwIfAborted();
      if (chunk.usage) {
        const usage = chunk.usage as typeof chunk.usage & { cost_usd?: number };
        if (
          ![usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(
            (count) => Number.isSafeInteger(count) && count >= 0,
          )
        ) {
          throw new InferenceError("AI provider returned invalid usage.");
        }
        const tokens: TokenUsage = {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          ...(typeof usage.cost_usd === "number" &&
          Number.isFinite(usage.cost_usd) &&
          usage.cost_usd >= 0
            ? { costUsd: usage.cost_usd }
            : {}),
        };
        yield { type: "usage", usage: tokens };
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
