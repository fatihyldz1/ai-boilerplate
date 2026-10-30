import { env } from "@app/config/env";
import OpenAI from "openai";
import { createHash } from "node:crypto";
import type { TokenUsage } from "./contracts.ts";
import { InferenceError } from "./errors.ts";

export function createProvider() {
  if (!env.OPENAI_API_KEY) throw new InferenceError("AI is not configured.");
  return new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    maxRetries: 0,
    timeout: env.AI_TIMEOUT_MS,
  });
}

export function tokenLimit(maxOutputTokens: number) {
  return env.OPENAI_TOKEN_LIMIT_FIELD === "max_tokens"
    ? { max_tokens: maxOutputTokens }
    : { max_completion_tokens: maxOutputTokens };
}

export function providerHeaders(input: { userId?: string; requestId?: string }) {
  return {
    ...(input.userId ? { "X-End-User": input.userId } : {}),
    ...(input.requestId ? { "X-Request-ID": input.requestId } : {}),
  };
}

export function providerConfigId() {
  return createHash("sha256")
    .update(
      JSON.stringify([env.OPENAI_BASE_URL, env.OPENAI_TOKEN_LIMIT_FIELD, env.AI_MAX_OUTPUT_TOKENS]),
    )
    .digest("hex")
    .slice(0, 16);
}

export function parseUsage(usage: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd?: number;
}): TokenUsage {
  if (
    ![usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(
      (count) => Number.isSafeInteger(count) && count >= 0,
    ) ||
    usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens
  ) {
    throw new InferenceError("AI provider returned invalid usage.");
  }
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    ...(typeof usage.cost_usd === "number" && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0
      ? { costUsd: usage.cost_usd }
      : {}),
  };
}
