import { env } from "@app/config/env";
import OpenAI from "openai";

let client: OpenAI | undefined;

export async function* streamText(input: {
  prompt: string;
  abortSignal?: AbortSignal;
}): AsyncGenerator<{ type: "text-delta"; delta: string } | { type: "complete"; text: string }> {
  const openai = getClient();
  const stream = await openai.responses.create(
    {
      model: env.OPENAI_MODEL,
      input: input.prompt,
      stream: true,
    },
    { signal: input.abortSignal },
  );

  let text = "";
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      text += event.delta;
      yield { type: "text-delta", delta: event.delta };
    }
  }

  yield { type: "complete", text };
}

function getClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to use AI streaming.");
  }
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
}
