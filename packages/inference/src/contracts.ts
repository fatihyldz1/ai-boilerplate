export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd?: number;
};

export type AIStreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "usage"; usage: TokenUsage }
  | { type: "complete"; text: string }
  | { type: "error"; message: string };

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseEvent(line: string): AIStreamEvent {
  const value = JSON.parse(line);
  if (value && typeof value === "object") {
    if (value.type === "text-delta" && typeof value.delta === "string") return value;
    if (value.type === "complete" && typeof value.text === "string") return value;
    if (value.type === "error" && typeof value.message === "string") return value;
    if (
      value.type === "usage" &&
      value.usage &&
      isCount(value.usage.inputTokens) &&
      isCount(value.usage.outputTokens) &&
      isCount(value.usage.totalTokens) &&
      (value.usage.costUsd === undefined ||
        (typeof value.usage.costUsd === "number" &&
          Number.isFinite(value.usage.costUsd) &&
          value.usage.costUsd >= 0))
    )
      return value;
  }
  throw new Error("Invalid AI stream event.");
}

export async function* readAIStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AIStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      if (done && buffer.trim()) lines.push(buffer);
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.length > 1_000_000) throw new Error("AI stream record is too large.");
        const event = parseEvent(line);
        yield event;
        if (event.type === "complete" || event.type === "error") return;
      }
      if (buffer.length > 1_000_000) throw new Error("AI stream record is too large.");
      if (done) throw new Error("AI stream ended before completion.");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
