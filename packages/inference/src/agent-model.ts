import { env } from "@app/config/env";
import type { AgentModel } from "./agent.ts";
import { InferenceError } from "./errors.ts";
import { createProvider, parseUsage, providerHeaders, tokenLimit } from "./provider.ts";

export function agentModel(identity: { userId: string; requestId?: string }): AgentModel {
  return async (context, options) => {
    const response = await createProvider().chat.completions.create(
      {
        model: env.OPENAI_MODEL,
        messages: context.messages,
        tools: context.tools,
        parallel_tool_calls: false,
        store: false,
        ...tokenLimit(options.maxOutputTokens),
      },
      { signal: options.signal, headers: providerHeaders(identity) },
    );
    options.signal.throwIfAborted();
    const choice = response.choices.find((item) => item.index === 0);
    if (!choice || !["stop", "tool_calls"].includes(choice.finish_reason)) {
      throw new InferenceError("The model stopped before completing its step.");
    }
    const calls = [];
    for (const call of choice.message.tool_calls ?? []) {
      if (call.type !== "function") throw new InferenceError("Unsupported AI tool call.");
      calls.push(call);
    }
    if ((choice.finish_reason === "tool_calls") !== Boolean(calls.length)) {
      throw new InferenceError("The model returned an inconsistent tool step.");
    }
    return {
      text: choice.message.content,
      calls,
      usage: response.usage ? parseUsage(response.usage) : undefined,
    };
  };
}
