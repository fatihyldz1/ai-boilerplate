import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { env, invalidateEnvForTesting } from "@app/config/env";

export async function withFakeProvider(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: () => Promise<void>,
) {
  const original = new Map(
    ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_TOKEN_LIMIT_FIELD"].map((key) => [
      key,
      process.env[key],
    ]),
  );
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test provider address.");
  process.env.OPENAI_API_KEY = "test-only-key";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.OPENAI_TOKEN_LIMIT_FIELD = "max_completion_tokens";
  invalidateEnvForTesting();
  try {
    await run();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    invalidateEnvForTesting();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

export function sendChunks(response: ServerResponse, chunks: unknown[]) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.end("data: [DONE]\n\n");
}

export function textChunk(content: string, finish_reason: string | null = null) {
  return {
    id: "test",
    object: "chat.completion.chunk",
    created: 1,
    model: env.OPENAI_MODEL,
    choices: [{ index: 0, delta: { content }, finish_reason }],
  };
}
