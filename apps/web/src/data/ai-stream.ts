import { readAIStream } from "@app/inference/contracts";

export async function* streamAI(
  prompt: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher("/api/ai/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : "AI request failed.");
  }
  if (!response.body) throw new Error("AI response did not contain a stream.");
  yield* readAIStream(response.body);
}
