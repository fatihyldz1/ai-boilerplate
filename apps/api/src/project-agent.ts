import { InferenceError, type StreamTextInput } from "@app/inference";
import type { AIStreamEvent } from "@app/inference/contracts";
import { runProjectAgent } from "@app/trpc";

export async function* streamProjectAgent(input: StreamTextInput): AsyncGenerator<AIStreamEvent> {
  if (!input.userId) throw new InferenceError("Sign in required.");
  const result = await runProjectAgent({
    prompt: input.prompt,
    userId: input.userId,
    requestId: input.requestId,
    signal: input.abortSignal,
    onStep: input.onStep,
  });
  if (result.usage) yield { type: "usage", usage: result.usage };
  if (result.text) yield { type: "text-delta", delta: result.text };
  yield { type: "complete", text: result.text };
}
